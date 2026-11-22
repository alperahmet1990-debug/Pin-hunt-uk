import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import PictureIndexCard from '../components/PictureIndexCard';

// The picture index card on Admin → Board Scans: progress, and build /
// continue / stop / retry, all through the API.

const base = {
  configured: true, ratePerMinute: 100, statusError: null,
  status: { referencesTotal: 116503, indexed: 0, failed: 0 },
  run: { running: false, done: 0, failed: 0, lastError: null, stopReason: null },
};
const fetchMock = jest.fn();
let info: unknown = base;
beforeEach(() => {
  jest.clearAllMocks();
  info = base;
  fetchMock.mockImplementation((_url: string, init?: { method?: string }) => Promise.resolve({
    ok: true, status: init?.method === 'POST' ? 202 : 200, json: () => Promise.resolve(init?.method === 'POST' ? {} : info),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url, init]) => `${String(url).replace(/^.*\/admin/, '/admin')} ${init.body}`);

describe('picture index card', () => {
  it('offers to build the index, with how long it will take', async () => {
    await render(<PictureIndexCard token="t" />);
    expect(await screen.findByText(/0 of 116,503 pictures indexed · 116,503 to go \(about 20 h\)/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Build picture index'));
    await waitFor(() => expect(posts()).toEqual(['/admin/board-scans-picture-index/run {}']));
  });

  it('shows a running build and can stop it', async () => {
    info = { ...base, status: { referencesTotal: 116503, indexed: 5000, failed: 2 }, run: { ...base.run, running: true, done: 120 } };
    await render(<PictureIndexCard token="t" />);
    expect(await screen.findByText(/Building… 120 done this run/)).toBeTruthy();
    expect(screen.queryByText('Retry failed')).toBeNull();
    await fireEvent.press(screen.getByText('Stop'));
    await waitFor(() => expect(posts()).toEqual(['/admin/board-scans-picture-index/stop {}']));
  });

  it('continues after a stop, retries failed pictures, and says why it stopped', async () => {
    info = { ...base, status: { referencesTotal: 100, indexed: 40, failed: 2 }, run: { ...base.run, stopReason: 'error', lastError: 'Picture description failed (403: Permission denied)' } };
    await render(<PictureIndexCard token="t" />);
    expect(await screen.findByText(/Stopped: Picture description failed \(403/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry failed'));
    await waitFor(() => expect(posts()).toEqual(['/admin/board-scans-picture-index/run {"retryFailed":true}']));
    expect(screen.getByText('Continue building')).toBeTruthy();
  });

  it('says when the index is off on the server', async () => {
    info = { ...base, configured: false, status: null };
    await render(<PictureIndexCard token="t" />);
    expect(await screen.findByText(/Off on this server/)).toBeTruthy();
    expect(screen.queryByText('Build picture index')).toBeNull();
  });

  it('checks progress every 15 seconds while building, never starting a check while one is waiting', async () => {
    jest.useFakeTimers();
    try {
      info = { ...base, status: { referencesTotal: 100, indexed: 10, failed: 0 }, run: { ...base.run, running: true, done: 10 } };
      await render(<PictureIndexCard token="t" />);
      await screen.findByText(/Building…/);
      const gets = () => fetchMock.mock.calls.filter(([, init]) => !init?.method).length;
      expect(gets()).toBe(1);

      // A slow answer: the next check doesn't start until it returns.
      let release!: (v: unknown) => void;
      fetchMock.mockImplementationOnce(() => new Promise((r) => { release = r; }));
      await act(async () => { jest.advanceTimersByTime(14_999); });
      expect(gets()).toBe(1);
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(gets()).toBe(2);
      await act(async () => { jest.advanceTimersByTime(15_000); });
      expect(gets()).toBe(2); // the earlier check is still waiting
      await act(async () => { release({ ok: true, status: 200, json: () => Promise.resolve(info) }); });
      await act(async () => { jest.advanceTimersByTime(15_000); });
      expect(gets()).toBe(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
