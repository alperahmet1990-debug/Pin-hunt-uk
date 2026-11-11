/**
 * LP-4 (#504) and LP-6 (#524): moderators see the reported message on the
 * report card, and can remove it.
 * - The message loads only on "Show message" (each view is recorded).
 * - Card states: the message (text, photos, pin shares), removed, gone, error.
 * - Remove needs a reason, confirms inline, calls the API and reloads.
 * - Both people in the chat see the removed placeholder.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { rowToReportedMessageView, type ReportedMessageView } from '@workspace/pin-repository';
import { ReportedMessagePanel } from '../components/ReportedMessagePanel';
import { isValidRemovalReason, requestMessageRemoval } from '../utils/removeReportedMessage';

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'admin-token' } }),
}));
jest.mock('@/lib/apiBase', () => ({ API_BASE: 'https://api.test/api' }));

const MESSAGE = '0d0d0d0d-1111-4222-8333-444455556666';

const okView: ReportedMessageView = {
  status: 'ok',
  message: {
    id: MESSAGE, senderId: 'u2', body: 'Nasty words here', messageType: 'text',
    pinIds: [], forTradePinIds: [], photoUrls: [], createdAt: '2026-11-01T10:00:00Z',
  },
};

function repoReturning(...views: ReportedMessageView[]) {
  const queue = [...views];
  return { getReportedMessage: jest.fn(() => Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0])) };
}

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

describe('Reported message on the report card', () => {
  it('does not load (or record a view) until the moderator asks', async () => {
    const repo = repoReturning(okView);
    await render(<ReportedMessagePanel reportId="r1" messageId={MESSAGE} repo={repo} />);
    expect(repo.getReportedMessage).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Show the reported message'));
    expect(await screen.findByText('Nasty words here')).toBeTruthy();
    expect(repo.getReportedMessage).toHaveBeenCalledWith('r1');
  });

  it('shows photos and pin shares', async () => {
    const repo = repoReturning({
      status: 'ok',
      message: { ...okView.message!, body: 'Shared a photo', messageType: 'photo',
        photoUrls: ['https://x/a.jpg', 'https://x/b.jpg'] },
    });
    await render(<ReportedMessagePanel reportId="r1" messageId={MESSAGE} repo={repo} />);
    await fireEvent.press(screen.getByLabelText('Show the reported message'));
    expect(await screen.findByLabelText('Reported photo 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Reported photo 2 of 2')).toBeTruthy();
  });

  it('lists shared pins', async () => {
    const repo = repoReturning({
      status: 'ok',
      message: { ...okView.message!, body: 'Shared 2 pins', messageType: 'pin_share', pinIds: ['PHUK-1', 'PHUK-2'] },
    });
    await render(<ReportedMessagePanel reportId="r1" messageId={MESSAGE} repo={repo} />);
    await fireEvent.press(screen.getByLabelText('Show the reported message'));
    expect(await screen.findByText('Shared pins: PHUK-1, PHUK-2')).toBeTruthy();
  });

  it('has a clear state when the message has gone', async () => {
    const repo = repoReturning({ status: 'gone' });
    await render(<ReportedMessagePanel reportId="r1" messageId={MESSAGE} repo={repo} />);
    await fireEvent.press(screen.getByLabelText('Show the reported message'));
    expect(await screen.findByTestId('reported-message-gone')).toBeTruthy();
    expect(screen.getByText(/no longer available/)).toBeTruthy();
    expect(screen.queryByLabelText('Remove this message')).toBeNull();
  });

  it('shows an already removed message with its reason, and no Remove action', async () => {
    const repo = repoReturning({
      status: 'removed',
      message: { ...okView.message!, body: 'Removed by PinHunt moderators', removedAt: '2026-11-02T10:00:00Z' },
      removal: { reason: 'Harassment', createdAt: '2026-11-02T10:00:00Z' },
    });
    await render(<ReportedMessagePanel reportId="r1" messageId={MESSAGE} repo={repo} />);
    await fireEvent.press(screen.getByLabelText('Show the reported message'));
    expect(await screen.findByTestId('reported-message-removed')).toBeTruthy();
    expect(screen.getByText(/Harassment/)).toBeTruthy();
    expect(screen.queryByText('Nasty words here')).toBeNull();
    expect(screen.queryByLabelText('Remove this message')).toBeNull();
  });

  it('shows an error with a retry', async () => {
    const repo = { getReportedMessage: jest.fn()
      .mockRejectedValueOnce(new Error('Only admins can see reported messages.'))
      .mockResolvedValueOnce(okView) };
    await render(<ReportedMessagePanel reportId="r1" messageId={MESSAGE} repo={repo} />);
    await fireEvent.press(screen.getByLabelText('Show the reported message'));
    expect(await screen.findByText('Only admins can see reported messages.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Nasty words here')).toBeTruthy();
  });
});

describe('Remove action', () => {
  async function openRemove(repo: ReturnType<typeof repoReturning>) {
    await render(<ReportedMessagePanel reportId="r1" messageId={MESSAGE} repo={repo} />);
    await fireEvent.press(screen.getByLabelText('Show the reported message'));
    await fireEvent.press(await screen.findByLabelText('Remove this message'));
  }

  it('needs a reason before Remove is enabled, and Cancel changes nothing', async () => {
    await openRemove(repoReturning(okView));
    await fireEvent.press(screen.getByLabelText('Confirm remove message'));
    expect(fetchMock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByLabelText('Remove this message')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes with the reason, then shows the removed state', async () => {
    const repo = repoReturning(okView, {
      status: 'removed',
      message: { ...okView.message!, body: 'Removed by PinHunt moderators', removedAt: '2026-11-02T10:00:00Z' },
      removal: { reason: 'Harassment', createdAt: '2026-11-02T10:00:00Z' },
    });
    fetchMock.mockResolvedValue({ status: 200, json: () => Promise.resolve({ removed: true, alreadyRemoved: false }) });
    await openRemove(repo);
    await fireEvent.changeText(screen.getByLabelText('Reason for removing the message'), '  Harassment ');
    await fireEvent.press(screen.getByLabelText('Confirm remove message'));

    expect(await screen.findByTestId('reported-message-removed')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.test/api/admin/messages/${MESSAGE}/remove`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
        body: JSON.stringify({ reason: 'Harassment' }),
      }),
    );
    expect(repo.getReportedMessage).toHaveBeenCalledTimes(2);
  });

  it('shows the server message when the removal is refused, and keeps the form', async () => {
    fetchMock.mockResolvedValue({ status: 409, json: () => Promise.resolve({ error: 'Only a message with an open report can be removed.' }) });
    await openRemove(repoReturning(okView));
    await fireEvent.changeText(screen.getByLabelText('Reason for removing the message'), 'Spam');
    await fireEvent.press(screen.getByLabelText('Confirm remove message'));
    expect(await screen.findByText('Only a message with an open report can be removed.')).toBeTruthy();
    expect(screen.getByLabelText('Reason for removing the message')).toBeTruthy();
  });
});

describe('requestMessageRemoval', () => {
  it('validates the reason locally', async () => {
    expect(isValidRemovalReason('')).toBe(false);
    expect(isValidRemovalReason('   ')).toBe(false);
    expect(isValidRemovalReason('x'.repeat(500))).toBe(true);
    expect(isValidRemovalReason('x'.repeat(501))).toBe(false);
    expect((await requestMessageRemoval('t', MESSAGE, ' ')).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps responses', async () => {
    expect(await requestMessageRemoval(undefined, MESSAGE, 'x')).toEqual({ ok: false, message: expect.any(String) });
    fetchMock.mockResolvedValueOnce({ status: 200, json: () => Promise.resolve({ removed: true, alreadyRemoved: true }) });
    expect(await requestMessageRemoval('t', MESSAGE, 'x')).toEqual({ ok: true, alreadyRemoved: true });
    fetchMock.mockResolvedValueOnce({ status: 403, json: () => Promise.resolve({}) });
    expect(await requestMessageRemoval('t', MESSAGE, 'x')).toEqual({ ok: false, message: 'Only admins can remove messages.' });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect((await requestMessageRemoval('t', MESSAGE, 'x')).ok).toBe(false);
  });
});

describe('rowToReportedMessageView', () => {
  it('maps the database result and treats anything unexpected as gone', () => {
    expect(rowToReportedMessageView(null)).toEqual({ status: 'gone' });
    expect(rowToReportedMessageView({ status: 'weird' })).toEqual({ status: 'gone' });
    const v = rowToReportedMessageView({
      status: 'removed',
      message: { id: 'm', sender_id: null, body: 'Removed by PinHunt moderators', message_type: 'text',
        pin_ids: [], for_trade_pin_ids: [], photo_urls: [], created_at: 'c', removed_at: 'r' },
      removal: { admin_id: 'a', reason: 'Spam', created_at: 'r' },
    });
    expect(v.status).toBe('removed');
    expect(v.message).toMatchObject({ id: 'm', senderId: undefined, removedAt: 'r' });
    expect(v.removal).toEqual({ adminId: 'a', reason: 'Spam', createdAt: 'r' });
    expect(v.message).not.toHaveProperty('conversationId');
  });
});
