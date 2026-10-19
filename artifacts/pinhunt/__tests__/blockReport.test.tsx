/**
 * B-P0-05b (#17): Block and Report.
 * - Block and Report are two taps from a collector profile and from a message.
 * - Blocking hides that collector's conversations; unblocking restores them.
 * - The Blocked users screen lists blocks and unblocks.
 * - Admins see profile and message reports, and can dismiss them.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { BlockedUsersProvider, useBlockedUsers } from '../context/BlockedUsersContext';

// The first test pays the collector screen's cold start, which passed 5 s on
// a busy CI runner (#454); the same allowance as scanResultFlow.
jest.setTimeout(20_000);

const mockPush = jest.fn();
const mockToast = jest.fn();
let mockParams: Record<string, string | undefined> = {};
let mockBlocked: { blockedUserId: string; username?: string; createdAt: string }[] = [];

const mockRepo = {
  getBlockedUsers: jest.fn(() => Promise.resolve(mockBlocked)),
  blockUser: jest.fn(() => Promise.resolve()),
  unblockUser: jest.fn(() => Promise.resolve()),
  reportUser: jest.fn(() => Promise.resolve({ id: 'r1' })),
  getUserReports: jest.fn(() => Promise.resolve([] as unknown[])),
  dismissUserReport: jest.fn(() => Promise.resolve()),
  getProfile: jest.fn((id: string) => Promise.resolve({ id, username: id === 'u2' ? 'bea' : 'sam' })),
  // Collector profile
  getTraderRating: jest.fn(() => Promise.resolve({ positive: 0, total: 0 })),
  getPotentialTrades: jest.fn(() => Promise.resolve([] as unknown[])),
  getCollectorForTradePins: jest.fn(() => Promise.resolve([] as unknown[])),
  // Conversations and chat
  getConversations: jest.fn(() => Promise.resolve([] as unknown[])),
  getConversation: jest.fn(() => Promise.resolve({
    id: 'c1', participantAId: 'me', participantBId: 'u2', createdAt: '2026-10-13T10:00:00Z',
    otherParticipant: { id: 'u2', username: 'bea' },
  })),
  getConversationMessages: jest.fn(() => Promise.resolve([
    { id: 'm1', conversationId: 'c1', senderId: 'u2', body: 'Hello from Bea', messageType: 'text', pinIds: [], forTradePinIds: [], photoUrls: [], createdAt: '2026-10-13T10:00:00Z' },
    { id: 'm2', conversationId: 'c1', senderId: 'me', body: 'My reply', messageType: 'text', pinIds: [], forTradePinIds: [], photoUrls: [], createdAt: '2026-10-13T10:01:00Z' },
  ])),
  // Admin moderation
  getCommunityFeed: jest.fn(() => Promise.resolve([] as unknown[])),
  getPostReportSummaries: jest.fn(() => Promise.resolve([] as unknown[])),
  getReportedComments: jest.fn(() => Promise.resolve([] as unknown[])),
};

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'me', isConfigured: true }) }));
// Stable identities: the collector screen reloads when getPublicProfile changes.
const mockGetPublicProfile = () => Promise.resolve({ id: 'u2', username: 'bea', displayName: 'Bea' });
const mockMyProfile = { id: 'me', username: 'me', isAdmin: true };
jest.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ profile: mockMyProfile, getPublicProfile: mockGetPublicProfile }),
}));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {}, setStatus: jest.fn() }) }));
jest.mock('@/context/UnreadMessagesContext', () => ({ useUnreadMessages: () => ({ markRead: jest.fn() }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: [], ensurePins: () => Promise.resolve() }) }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: mockToast, hide: jest.fn() }) }));

function withProvider(node: React.ReactElement) {
  return render(<BlockedUsersProvider>{node}</BlockedUsersProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockBlocked = [];
});

describe('Collector profile: Block and Report in two taps', () => {
  const CollectorProfileScreen = () => {
    const Screen = require('../app/collector/[username]').default;
    return <Screen />;
  };

  beforeEach(() => { mockParams = { username: 'bea' }; });

  it('More options (tap 1) shows Report and Block (tap 2); blocking needs one confirmation', async () => {
    await withProvider(<CollectorProfileScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'More options for @bea' }));
    expect(screen.getByRole('button', { name: 'Report @bea' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Block @bea' }));
    expect(screen.getByRole('header', { name: 'Block @bea?' })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('safety-confirm-block'));
    expect(mockRepo.blockUser).toHaveBeenCalledWith('me', 'u2');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Blocked @bea' }));
    // Their profile now says so, with Unblock, and no Message button.
    expect(await screen.findByTestId('collector-blocked-notice')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Message' })).toBeNull();
  });

  it('reports a profile with a reason and optional details', async () => {
    await withProvider(<CollectorProfileScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'More options for @bea' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Report @bea' }));
    // Send is disabled until a reason is chosen.
    expect(screen.getByTestId('safety-send-report').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Scam or fraud' }));
    await fireEvent.changeText(screen.getByLabelText('Report details, optional'), 'Asked for payment first');
    await fireEvent.press(screen.getByTestId('safety-send-report'));
    expect(mockRepo.reportUser).toHaveBeenCalledWith('me', {
      reportedUserId: 'u2',
      messageId: undefined,
      reason: 'Scam or fraud: Asked for payment first',
    });
    expect(mockToast).toHaveBeenCalledWith({ message: 'Report sent. Thanks, our team will review it.' });
  });

  it('a blocked collector shows Unblock instead of Block, and Unblock restores the profile', async () => {
    mockBlocked = [{ blockedUserId: 'u2', username: 'bea', createdAt: '2026-10-01T00:00:00Z' }];
    await withProvider(<CollectorProfileScreen />);
    expect(await screen.findByTestId('collector-blocked-notice')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unblock @bea' }));
    expect(mockRepo.unblockUser).toHaveBeenCalledWith('me', 'u2');
    await waitFor(() => expect(screen.queryByTestId('collector-blocked-notice')).toBeNull());
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy();
  });
});

describe('Chat: long-press a message to report or block', () => {
  beforeEach(() => { mockParams = { id: 'c1' }; });

  it('press and hold on their message opens Report message and Block (two taps)', async () => {
    const ChatScreen = require('../app/community/chat/[id]').default;
    await withProvider(<ChatScreen />);
    await screen.findByText('Hello from Bea');
    // Only their messages respond; mine don't.
    expect(screen.queryByTestId('message-m2')).toBeNull();
    await fireEvent(screen.getByTestId('message-m1'), 'longPress');
    expect(screen.getByRole('button', { name: 'Block @bea' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Report message' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Harassment or bullying' }));
    await fireEvent.press(screen.getByTestId('safety-send-report'));
    expect(mockRepo.reportUser).toHaveBeenCalledWith('me', {
      reportedUserId: 'u2',
      messageId: 'm1',
      reason: 'Harassment or bullying',
    });
  }, 30_000);

  it('a conversation with a blocked collector hides their messages and the composer', async () => {
    mockBlocked = [{ blockedUserId: 'u2', username: 'bea', createdAt: '2026-10-01T00:00:00Z' }];
    const ChatScreen = require('../app/community/chat/[id]').default;
    await withProvider(<ChatScreen />);
    expect(await screen.findByTestId('chat-blocked')).toBeTruthy();
    expect(screen.queryByText('Hello from Bea')).toBeNull();
    expect(screen.queryByPlaceholderText('Type a message…')).toBeNull();
  }, 30_000);
});

describe('Messages list hides blocked collectors', () => {
  it('drops conversations with a blocked collector and brings them back on unblock', async () => {
    mockBlocked = [{ blockedUserId: 'u2', username: 'bea', createdAt: '2026-10-01T00:00:00Z' }];
    mockRepo.getConversations.mockResolvedValue([
      { id: 'c1', participantAId: 'me', participantBId: 'u2', createdAt: '2026-10-01T00:00:00Z', otherParticipant: { id: 'u2', username: 'bea' } },
      { id: 'c2', participantAId: 'u3', participantBId: 'me', createdAt: '2026-10-01T00:00:00Z', otherParticipant: { id: 'u3', username: 'cal' } },
    ]);
    const ConversationsScreen = require('../app/community/conversations').default;
    let unblock: (id: string) => Promise<void> = async () => {};
    function Grab() { unblock = useBlockedUsers().unblock; return null; }
    await withProvider(<><Grab /><ConversationsScreen /></>);
    expect(await screen.findByText('@cal')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('@bea')).toBeNull());
    await act(async () => { await unblock('u2'); });
    expect(screen.getByText('@bea')).toBeTruthy();
  });
});

describe('Blocked users screen', () => {
  it('lists blocked collectors and unblocks with Undo', async () => {
    mockBlocked = [{ blockedUserId: 'u2', username: 'bea', createdAt: '2026-10-01T00:00:00Z' }];
    const BlockedUsersScreen = require('../app/settings/blocked-users').default;
    await withProvider(<BlockedUsersScreen />);
    expect(await screen.findByText('@bea')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unblock @bea' }));
    expect(mockRepo.unblockUser).toHaveBeenCalledWith('me', 'u2');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unblocked @bea', action: expect.objectContaining({ label: 'Undo' }) }));
    expect(await screen.findByText('No blocked collectors')).toBeTruthy();
  });

  it('rolls back when the server refuses the unblock', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockBlocked = [{ blockedUserId: 'u2', username: 'bea', createdAt: '2026-10-01T00:00:00Z' }];
    mockRepo.unblockUser.mockRejectedValueOnce(new Error('boom'));
    const BlockedUsersScreen = require('../app/settings/blocked-users').default;
    await withProvider(<BlockedUsersScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Unblock @bea' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('@bea')).toBeTruthy();
  });
});

describe('Admin moderation shows user and message reports', () => {
  it('lists both report types with names, and dismisses after confirmation', async () => {
    mockRepo.getUserReports.mockResolvedValue([
      { id: 'r1', target: 'message', reporterId: 'u3', reportedUserId: 'u2', messageId: 'm1', reason: 'Spam', createdAt: new Date().toISOString() },
      { id: 'r2', target: 'profile', reporterId: 'u4', reportedUserId: 'u2', createdAt: new Date().toISOString() },
    ]);
    const ModerationScreen = require('../app/admin/community-moderation').default;
    await render(<ModerationScreen />);
    expect(await screen.findByText('REPORTED USERS AND MESSAGES (2)')).toBeTruthy();
    expect(screen.getByText('Message reported · Spam')).toBeTruthy();
    expect(screen.getByText('Profile reported')).toBeTruthy();
    expect(screen.getAllByText('2 open reports against @bea')).toHaveLength(2);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Dismiss report about @bea' })[0]);
    expect(screen.getByText('Dismiss this report? Nothing else changes.')).toBeTruthy();
    // The first card's button became its confirm bar, so its Dismiss comes first.
    await fireEvent.press(screen.getAllByText('Dismiss')[0]);
    expect(mockRepo.dismissUserReport).toHaveBeenCalledWith('r1');
    await waitFor(() => expect(screen.getByText('REPORTED USERS AND MESSAGES (1)')).toBeTruthy());
  });

  it('a failing user-reports query leaves the post queue working', async () => {
    mockRepo.getUserReports.mockRejectedValue(new Error('relation does not exist'));
    const ModerationScreen = require('../app/admin/community-moderation').default;
    await render(<ModerationScreen />);
    expect(await screen.findByText('No community posts yet.')).toBeTruthy();
    expect(screen.queryByTestId('admin-user-reports')).toBeNull();
  });
});
