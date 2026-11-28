import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PictureIndexRow, pictureIndexView } from '@/components/admin/PictureIndexRow';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); },
}));

const status = (indexed: number, total: number, failed = 0, extra: Record<string, unknown> = {}) => ({
  configured: true, autoResume: false, status: { referencesTotal: total, indexed, failed }, run: { running: false, done: 0, failed: 0, lastError: null, stopReason: null }, ...extra,
});

describe('pictureIndexView', () => {
  it('shows progress, what is left, and whether it tops up by itself', () => {
    expect(pictureIndexView(status(116669, 117620, 2))).toEqual({
      kind: 'ok', text: '116,669 of 117,620 pictures indexed',
      detail: '949 to add · 2 failed · Not automatic',
      complete: false, running: false, canBuild: true,
    });
    const done = pictureIndexView(status(117618, 117620, 2, { autoResume: true }));
    expect(done).toMatchObject({ detail: 'Up to date · 2 failed · Tops up daily by itself', complete: true, canBuild: false });
  });
  it('says when a build is running', () => {
    expect(pictureIndexView(status(1000, 2000, 0, { run: { running: true, done: 120, failed: 0, lastError: null, stopReason: null } })))
      .toMatchObject({ detail: expect.stringContaining('Building… 120 this run'), running: true, canBuild: false });
  });
  it('explains when it is off or unreadable', () => {
    expect(pictureIndexView(null).kind).toBe('off');
    expect(pictureIndexView({ configured: false, status: null }).kind).toBe('off');
    expect(pictureIndexView({ configured: true, status: null, statusError: 'Could not read the picture index.' })).toEqual({ kind: 'error', text: 'Could not read the picture index.' });
  });
});

describe('PictureIndexRow', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it('shows the count, starts a build, and opens Board Scans when tapped', async () => {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => Promise.resolve({
      ok: true, status: init?.method === 'POST' ? 202 : 200,
      json: () => Promise.resolve(init?.method === 'POST' ? {} : status(116669, 117620)),
    }));
    await render(<PictureIndexRow token="t" />);
    expect(await screen.findByText('116,669 of 117,620 pictures indexed')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue building'));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith('/board-scans-picture-index/run') && i?.method === 'POST')).toBe(true));
    await fireEvent.press(screen.getByLabelText('Picture index: open Board Scans'));
    expect(mockPush).toHaveBeenCalledWith('/admin/board-scans');
  });

  it('says board scanning is off when the server has it switched off', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Not found' }) });
    await render(<PictureIndexRow token="t" />);
    expect(await screen.findByText('Board scanning is off on this server.')).toBeTruthy();
  });
});
