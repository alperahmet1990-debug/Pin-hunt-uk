/**
 * UXR-28 (#693): the Messages list reloads when focused again and renders
 * unread badges from UnreadMessagesContext.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react-native';

const mockGetConversations = jest.fn();
const mockRepo = { getConversations: (...a: unknown[]) => mockGetConversations(...a) };
let mockUnread: Record<string, number> = {};
let mockFocusCb: (() => void) | undefined;

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => {
  const R = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    // Like the real hook: run the callback whenever its identity changes (focus).
    useFocusEffect: (cb: () => void) => { mockFocusCb = cb; R.useEffect(() => { cb(); }, [cb]); },
    Stack: { Screen: () => null },
  };
});
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/context/BlockedUsersContext', () => ({ useBlockedUsers: () => ({ blockedIds: new Set<string>() }) }));
jest.mock('@/context/UnreadMessagesContext', () => ({ useUnreadMessages: () => ({ unreadByConversation: mockUnread }) }));

const conv = (id: string, body: string) => ({
  id, participantAId: 'u1', participantBId: 'u2', createdAt: '2026-11-01T10:00:00Z',
  lastMessageAt: '2026-11-01T10:00:00Z', lastMessage: { body }, unreadCount: 5,
  otherParticipant: { id: 'u2', username: 'bea' },
});

describe('Messages list refresh (UXR-28)', () => {
  beforeEach(() => { mockGetConversations.mockReset(); mockUnread = { c1: 2 }; mockFocusCb = undefined; });

  it('loads once on mount, then again on a later focus', async () => {
    mockGetConversations.mockResolvedValue([conv('c1', 'old preview')]);
    const Screen = require('../app/community/conversations').default;
    await render(<Screen />);
    await screen.findByText('old preview');
    expect(mockGetConversations).toHaveBeenCalledTimes(1);

    mockGetConversations.mockResolvedValue([conv('c1', 'new preview'), conv('c2', 'fresh chat')]);
    await act(async () => { mockFocusCb?.(); });
    await screen.findByText('new preview');
    expect(screen.getByText('fresh chat')).toBeTruthy();
    expect(mockGetConversations).toHaveBeenCalledTimes(2);
  });

  it('shows the badge from context counts, not the fetched unreadCount', async () => {
    mockGetConversations.mockResolvedValue([conv('c1', 'hello')]);
    const Screen = require('../app/community/conversations').default;
    const view = await render(<Screen />);
    await screen.findByText('hello');
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('5')).toBeNull();

    mockUnread = {};
    await act(async () => { view.rerender(<Screen />); });
    await waitFor(() => expect(screen.queryByText('2')).toBeNull());
  });
});
