import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PostDetailScreen from '../community/post/[id]';

// UXR-24 (#689): deleting a post or comment uses the in-app ConfirmDialog
// (Alert.alert callbacks don't run on Expo web).
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: jest.fn(), back: (...a: unknown[]) => mockBack(...a) }),
  useFocusEffect: (cb: () => void) => { const React = require('react'); React.useEffect(cb, []); },
  Stack: { Screen: (props: { options?: { headerRight?: () => React.ReactNode } }) => (props.options?.headerRight ? props.options.headerRight() : null) },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useColors', () => ({ useColors: () => new Proxy({}, { get: () => '#000000' }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: false }));
jest.mock('@/context/BlockedUsersContext', () => ({ useBlockedUsers: () => ({ blockedIds: new Set(), isBlocked: () => false }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { isAdmin: false } }) }));
let mockRepo: Record<string, jest.Mock>;
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => ({ repo: mockRepo, userId: 'me' }) }));

const post = {
  id: 'p1', authorId: 'me', postType: 'discussion', title: 'Hello', body: 'Body text',
  createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', photos: [], authorProfile: { username: 'me' },
};
const comment = {
  id: 'c1', postId: 'p1', authorId: 'me', body: 'My comment',
  createdAt: '2026-11-01T11:00:00Z', authorProfile: { username: 'me' },
};

function makeRepo() {
  return {
    getCommunityPost: jest.fn().mockResolvedValue(post),
    getPostComments: jest.fn().mockResolvedValue([comment]),
    hasReportedPost: jest.fn().mockResolvedValue(false),
    getMyReportedCommentIds: jest.fn().mockResolvedValue([]),
    deleteCommunityPost: jest.fn().mockResolvedValue(undefined),
    deletePostComment: jest.fn().mockResolvedValue(undefined),
  };
}

describe('Post detail: in-app delete confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo = makeRepo();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('confirming the post dialog deletes the post and navigates back', async () => {
    const { findByTestId, findByText, queryByText } = await render(<PostDetailScreen />);
    await fireEvent.press(await findByTestId('delete-post-button'));
    expect(await findByText('Delete post?')).toBeTruthy();
    expect(mockRepo.deleteCommunityPost).not.toHaveBeenCalled();
    await fireEvent.press(await findByText('Delete'));
    await waitFor(() => expect(mockRepo.deleteCommunityPost).toHaveBeenCalledWith('p1'));
    expect(mockBack).toHaveBeenCalled();
    expect(queryByText('Delete post?')).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('cancel and backdrop do nothing', async () => {
    const { findByTestId, findByText, queryByText } = await render(<PostDetailScreen />);
    await fireEvent.press(await findByTestId('delete-post-button'));
    await fireEvent.press(await findByText('Cancel'));
    expect(queryByText('Delete post?')).toBeNull();
    await fireEvent.press(await findByTestId('delete-post-button'));
    await fireEvent.press(await findByTestId('confirm-backdrop', { includeHiddenElements: true }));
    expect(queryByText('Delete post?')).toBeNull();
    expect(mockRepo.deleteCommunityPost).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('confirming the comment dialog deletes the comment', async () => {
    const { findByTestId, findByText, queryByText } = await render(<PostDetailScreen />);
    await fireEvent.press(await findByTestId('delete-comment-button'));
    expect(await findByText('Delete comment?')).toBeTruthy();
    await fireEvent.press(await findByText('Delete'));
    await waitFor(() => expect(mockRepo.deletePostComment).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(queryByText('My comment')).toBeNull());
  });

  it('still surfaces an error when the delete fails', async () => {
    mockRepo.deleteCommunityPost.mockRejectedValue(new Error('boom'));
    const { findByTestId, findByText } = await render(<PostDetailScreen />);
    await fireEvent.press(await findByTestId('delete-post-button'));
    await fireEvent.press(await findByText('Delete'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', 'boom'));
    expect(mockBack).not.toHaveBeenCalled();
  });
});
