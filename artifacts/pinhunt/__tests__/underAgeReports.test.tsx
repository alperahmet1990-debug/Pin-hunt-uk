/**
 * LP-9 (#531): "May be under 18" reports and account closure.
 * - The reason is offered when reporting a profile or a message.
 * - Moderation shows these reports first, labelled.
 * - "Close as under 18" suspends the account and marks it under 18 (migration
 *   072); "Undo" clears both. Both use in-app confirmations.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import {
  isUnderAgeReport,
  UNDER_18_CLOSURE_REASON,
  underAgeReportsFirst,
  USER_REPORT_REASONS,
} from '../utils/blockedUsers';

// Cold start of the moderation screen is slow on a busy machine (see blockReport.test.tsx).
jest.setTimeout(60_000);

const mockRepo = {
  getUserReports: jest.fn(() => Promise.resolve([] as unknown[])),
  dismissUserReport: jest.fn(() => Promise.resolve()),
  getProfile: jest.fn((id: string) => Promise.resolve({ id, username: id === 'u2' ? 'bea' : id === 'u3' ? 'cal' : 'sam', isAdmin: false })),
  getCommunityFeed: jest.fn(() => Promise.resolve([] as unknown[])),
  getPostReportSummaries: jest.fn(() => Promise.resolve([] as unknown[])),
  getReportedComments: jest.fn(() => Promise.resolve([] as unknown[])),
  getSuspensions: jest.fn(() => Promise.resolve([] as unknown[])),
  suspendUser: jest.fn(() => Promise.resolve()),
  liftSuspension: jest.fn(() => Promise.resolve()),
  setAgeDeclined: jest.fn(() => Promise.resolve()),
};
let mockAccess = { isAppCreator: false, isAdmin: true, isContributor: false, loading: false };

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  router: { push: jest.fn() },
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'me', isConfigured: true }) }));
const mockMyProfile = { id: 'me', username: 'me', isAdmin: true };
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: mockMyProfile }) }));
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }));
jest.mock('@/hooks/useMyAccess', () => ({ useMyAccess: () => mockAccess }));
jest.mock('@/components/ui/Toast', () => ({ useToast: () => ({ show: jest.fn(), hide: jest.fn() }) }));

const ModerationScreen = () => {
  const Screen = require('../app/admin/community-moderation').default;
  return <Screen />;
};

const report = (id: string, reportedUserId: string, reason: string, createdAt: string) => ({
  id, target: 'profile', reporterId: 'u4', reportedUserId, reason, createdAt,
});

describe('"May be under 18" reason', () => {
  it('is offered in the report sheet (profiles and messages share the list)', () => {
    expect(USER_REPORT_REASONS).toContain('May be under 18');
    expect(USER_REPORT_REASONS[USER_REPORT_REASONS.length - 1]).toBe('Other');
  });

  it('recognises the reason with or without details', () => {
    expect(isUnderAgeReport({ reason: 'May be under 18' })).toBe(true);
    expect(isUnderAgeReport({ reason: 'May be under 18: says they are in year 9' })).toBe(true);
    expect(isUnderAgeReport({ reason: 'Spam: may be under 18' })).toBe(false);
    expect(isUnderAgeReport({ reason: undefined })).toBe(false);
  });

  it('puts these reports first and keeps the rest in order', () => {
    const a = { id: 'a', reason: 'Spam' };
    const b = { id: 'b', reason: 'May be under 18' };
    const c = { id: 'c', reason: 'Other' };
    const d = { id: 'd', reason: 'May be under 18: details' };
    expect(underAgeReportsFirst([a, b, c, d]).map(r => r.id)).toEqual(['b', 'd', 'a', 'c']);
    const none = [a, c];
    expect(underAgeReportsFirst(none)).toBe(none);
  });
});

describe('Moderation: close as under 18, and undo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess = { isAppCreator: false, isAdmin: true, isContributor: false, loading: false };
    // Newest first from the server; the under-18 report is older but goes first.
    mockRepo.getUserReports.mockResolvedValue([
      report('r-spam', 'u3', 'Spam', '2026-11-09T12:00:00Z'),
      report('r-age', 'u2', 'May be under 18', '2026-11-09T10:00:00Z'),
    ]);
    mockRepo.getSuspensions.mockResolvedValue([]);
  });

  it('shows "May be under 18" reports first, labelled', async () => {
    await render(<ModerationScreen />);
    expect(await screen.findByText('REPORTED USERS AND MESSAGES (2)')).toBeTruthy();
    const section = screen.getByTestId('admin-user-reports');
    const names = within(section).getAllByText(/^@(bea|cal)$/).map(n => n.props.children);
    expect(names).toEqual(['@bea', '@cal']);
    expect(screen.getAllByText('MAY BE UNDER 18')).toHaveLength(1);
    // Only the under-18 report offers the closure.
    expect(screen.getByRole('button', { name: 'Close @bea as under 18' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close @cal as under 18' })).toBeNull();
  });

  it('closes the account after an in-app confirmation: suspension, then the under-18 mark', async () => {
    await render(<ModerationScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Close @bea as under 18' }));
    expect(screen.getByText(/Close @bea as under 18\? The account is suspended/)).toBeTruthy();
    expect(mockRepo.suspendUser).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Close account'));
    await waitFor(() => expect(mockRepo.setAgeDeclined).toHaveBeenCalledWith('u2', true));
    expect(mockRepo.suspendUser).toHaveBeenCalledWith('me', 'u2', UNDER_18_CLOSURE_REASON);
    expect(await screen.findByText('Closed as under 18')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo closing @bea' })).toBeTruthy();
  });

  it('Cancel changes nothing', async () => {
    await render(<ModerationScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Close @bea as under 18' }));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(mockRepo.suspendUser).not.toHaveBeenCalled();
    expect(mockRepo.setAgeDeclined).not.toHaveBeenCalled();
  });

  it('shows the error and stays put when the server refuses', async () => {
    mockRepo.setAgeDeclined.mockRejectedValueOnce(new Error('You can’t close this account.'));
    await render(<ModerationScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Close @bea as under 18' }));
    await fireEvent.press(screen.getByText('Close account'));
    expect(await screen.findByText('You can’t close this account.')).toBeTruthy();
    expect(screen.queryByText('Closed as under 18')).toBeNull();
  });

  it('Undo clears the mark and lifts the suspension', async () => {
    mockRepo.getSuspensions.mockResolvedValue([
      { userId: 'u2', suspendedBy: 'me', reason: UNDER_18_CLOSURE_REASON, createdAt: '2026-11-09T11:00:00Z' },
    ]);
    await render(<ModerationScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Undo closing @bea' }));
    expect(screen.getByText(/Undo closing @bea\? The suspension is lifted/)).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Undo').slice(-1)[0]);
    await waitFor(() => expect(mockRepo.liftSuspension).toHaveBeenCalledWith('u2'));
    expect(mockRepo.setAgeDeclined).toHaveBeenCalledWith('u2', false);
    await waitFor(() => expect(screen.queryByText('Closed as under 18')).toBeNull());
  });
});
