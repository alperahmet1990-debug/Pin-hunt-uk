import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';

// B-P1-01b (#25): with Supabase configured, the app no longer preloads 500
// catalogue pins at start-up; screens fetch what they need.
const mockRepo = {
  searchPins: jest.fn(() => Promise.resolve([])),
  getPinsByIds: jest.fn((ids: string[]) => Promise.resolve(ids.map(id => ({ id, title: `Pin ${id}`, collection: 'Set A' })))),
  getPinsBySeries: jest.fn((name: string) => Promise.resolve([
    { id: 's1', title: 'Set pin 1', collection: name },
    { id: 's2', title: 'Set pin 2', collection: name },
  ])),
};

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/demoMode', () => ({ demoCatalogueSize: 0 }));
jest.mock('@workspace/pin-repository', () => ({ createSupabasePinRepository: () => mockRepo }));

const ENV = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;
const saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
afterAll(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

type Ctx = { pins: { id: string }[]; loading: boolean; ensurePins(ids: string[]): Promise<void>; ensureCollections(names: string[]): Promise<void> };

// "Configured" is read when the module loads, so set it before the first require.
function loadContext(): typeof import('../PinCatalogueContext') {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.test';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  return require('../PinCatalogueContext');
}

async function renderWithContext() {
  const { PinCatalogueProvider, usePinCatalogue } = loadContext();
  let ctx!: Ctx;
  function Probe() {
    ctx = usePinCatalogue() as unknown as Ctx;
    return <Text>{ctx.loading ? 'loading' : `${ctx.pins.length} pins`}</Text>;
  }
  await render(<PinCatalogueProvider><Probe /></PinCatalogueProvider>);
  return () => ctx;
}

beforeEach(() => jest.clearAllMocks());

describe('Catalogue without a start-up preload (#25)', () => {
  it('does not fetch catalogue pins on mount and is not left loading', async () => {
    await renderWithContext();
    expect(screen.getByText('0 pins')).toBeTruthy();
    expect(mockRepo.searchPins).not.toHaveBeenCalled();
    expect(mockRepo.getPinsByIds).not.toHaveBeenCalled();
  });

  it('fetches pins on demand: a collection\'s pins and a whole set', async () => {
    const ctx = await renderWithContext();
    await act(async () => { await ctx().ensurePins(['p1', 'p2']); });
    expect(mockRepo.getPinsByIds).toHaveBeenCalledWith(['p1', 'p2']);
    await act(async () => { await ctx().ensureCollections(['Set A']); });
    expect(mockRepo.getPinsBySeries).toHaveBeenCalledWith('Set A');
    await waitFor(() => expect(screen.getByText('4 pins')).toBeTruthy());
    expect(mockRepo.searchPins).not.toHaveBeenCalled();
  });
});
