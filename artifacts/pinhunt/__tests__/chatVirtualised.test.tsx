/**
 * UX-052 (#160): Chat renders messages in an inverted, virtualised FlatList,
 * newest at the bottom, with the context banner and trade card at the top of
 * the conversation.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { ConversationMessage } from '@workspace/pin-repository';
import { chatListData } from '../utils/chatList';

const mockMessages: ConversationMessage[] = Array.from({ length: 300 }, (_, i) => ({
  id: `m${i + 1}`, conversationId: 'c1', senderId: i % 2 ? 'u1' : 'u2', body: `Message ${i + 1}`,
  messageType: 'text' as const, pinIds: [], forTradePinIds: [], photoUrls: [],
  createdAt: new Date(Date.UTC(2026, 9, 13, 10, 0, i)).toISOString(),
}));
const mockRepo = {
  getConversation: () => Promise.resolve({
    id: 'c1', participantAId: 'u1', participantBId: 'u2', contextPostId: 'post1', createdAt: '2026-10-13T10:00:00Z',
    otherParticipant: { id: 'u2', username: 'bea' },
  }),
  getConversationMessages: () => Promise.resolve(mockMessages),
  getCommunityPost: () => Promise.resolve({ id: 'post1', postType: 'for_trade', body: 'Trading my spare Stitch' }),
};

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'c1' }),
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/context/UnreadMessagesContext', () => ({ useUnreadMessages: () => ({ markRead: jest.fn() }) }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: {} }) }));
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => ({ pins: [], ensurePins: () => Promise.resolve() }) }));

describe('chatListData', () => {
  it('puts the newest message first without changing the input', () => {
    const input = mockMessages.slice(0, 3);
    expect(chatListData(input).map(m => m.id)).toEqual(['m3', 'm2', 'm1']);
    expect(input.map(m => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('Chat message list (UX-052)', () => {
  it('is an inverted list that renders only the newest messages of a 300-message chat', async () => {
    const ChatScreen = require('../app/community/chat/[id]').default;
    await render(<ChatScreen />);
    const list = await screen.findByTestId('chat-messages');
    expect(list.props.inverted).toBe(true);

    // Newest is rendered; the oldest isn't until scrolled to.
    expect(screen.getByText('Message 300')).toBeTruthy();
    expect(screen.queryByText('Message 1')).toBeNull();
    const rendered = screen.queryAllByText(/^Message \d+$/).length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
  }, 30_000);

  it('keeps the context banner at the start of the conversation', async () => {
    const ChatScreen = require('../app/community/chat/[id]').default;
    // A short chat, so the start of the conversation is within the first render.
    mockMessages.splice(3);
    await render(<ChatScreen />);
    expect(await screen.findByText('From post: Trading my spare Stitch')).toBeTruthy();
    expect(screen.getByText('Message 1')).toBeTruthy();
  }, 30_000);
});
