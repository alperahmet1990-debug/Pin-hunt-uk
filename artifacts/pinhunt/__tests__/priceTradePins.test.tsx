import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { CommunityPrice, MyPinPrice } from '@workspace/pin-repository';
import PriceTradePinsScreen from '../app/price-trade-pins';
import { createPriceSaveQueue } from '../utils/priceSaveQueue';
import { resetCommunityPriceCacheForTests } from '../hooks/useCommunityPrice';
import { resetPriceCurrencyForTests } from '../hooks/usePriceCurrency';

// CV-05 (#516): price every For Trade pin in one list.

describe('price save queue', () => {
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
  };

  it('one write at a time per pin, ending on the latest value', async () => {
    const writes: (number | null)[] = [];
    const gates: ReturnType<typeof deferred>[] = [];
    const queue = createPriceSaveQueue((_p, _c, amount) => {
      writes.push(amount);
      const g = deferred();
      gates.push(g);
      return g.promise;
    });
    const a = queue.save('p1', 'GBP', 10);
    const b = queue.save('p1', 'GBP', 11);
    const c = queue.save('p1', 'GBP', 12);
    expect(writes).toEqual([10]);           // the rest wait for the first
    gates[0].resolve();
    await waitFor(() => expect(writes).toEqual([10, 12])); // 11 is skipped: only the latest matters
    gates[1].resolve();
    await Promise.all([a, b, c]);
    expect(writes).toEqual([10, 12]);
  });

  it('different pins save in parallel', () => {
    const writes: string[] = [];
    const queue = createPriceSaveQueue(async pinId => { writes.push(pinId); await new Promise(() => {}); });
    void queue.save('p1', 'GBP', 1);
    void queue.save('p2', 'GBP', 2);
    expect(writes).toEqual(['p1', 'p2']);
  });

  it('a failure is reported to the waiting save', async () => {
    const queue = createPriceSaveQueue(async () => { throw new Error('offline'); });
    await expect(queue.save('p1', 'GBP', 5)).rejects.toThrow('offline');
  });
});

let mockService: Record<string, jest.Mock> | null = null;
let mine: MyPinPrice[] = [];
const PINS = [
  { id: 'p1', title: 'Tinker Bell', collection: 'Set' },
  { id: 'p2', title: 'Stitch Aloha', collection: 'Set' },
  { id: 'p3', title: 'Winnie Honey', collection: 'Set' },
  { id: 'p4', title: 'Owned only', collection: 'Set' },
];
const mockCollection = {
  p1: { pinId: 'p1', status: 'for_trade', quantity: 2 },
  p2: { pinId: 'p2', status: 'for_trade', quantity: 1 },
  p3: { pinId: 'p3', status: 'for_trade', quantity: 1 },
  p4: { pinId: 'p4', status: 'owned', quantity: 1 },
};

jest.mock('@/lib/communityPriceService', () => ({ getCommunityPriceService: () => mockService }));
jest.mock('@/context/CollectionContext', () => ({ useCollection: () => ({ collection: mockCollection }) }));
const mockCatalogue = { pins: PINS, ensurePins: () => Promise.resolve() };
jest.mock('@/context/PinCatalogueContext', () => ({ usePinCatalogue: () => mockCatalogue }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: jest.fn() }) }));

beforeEach(() => {
  resetCommunityPriceCacheForTests();
  resetPriceCurrencyForTests();
  mine = [{ pinId: 'p2', currency: 'GBP', amount: 8, updatedAt: 'x' }];
  const community: CommunityPrice = { pinId: 'p1', currency: 'GBP', collectorCount: 7, median: 11, low: 9, high: 13, step: 'confident' };
  mockService = {
    getMyPinPrices: jest.fn(async () => mine),
    setMyPinPrice: jest.fn(async () => {}),
    clearMyPinPrice: jest.fn(async () => {}),
    getCommunityPrice: jest.fn(async () => community),
  };
});

const field = (title: string) => screen.getByLabelText(`Price for ${title}, in pounds`);

describe('Price my trade pins (CV-05)', () => {
  it('lists only For Trade pins with their saved prices and a progress count', async () => {
    await render(<PriceTradePinsScreen />);
    await waitFor(() => expect(field('Stitch Aloha').props.value).toBe('8'));
    expect(screen.getByText('1 of 3 priced')).toBeTruthy();
    expect(screen.queryByText('Owned only')).toBeNull();
    expect(screen.getByText('For Trade · 2 copies')).toBeTruthy();
  });

  it('saves on Done, then shows the community price for that pin only', async () => {
    await render(<PriceTradePinsScreen />);
    await waitFor(() => expect(field('Stitch Aloha').props.value).toBe('8'));
    expect(screen.queryByText(/Community price/)).toBeNull();
    await fireEvent.changeText(field('Tinker Bell'), '12');
    await fireEvent(field('Tinker Bell'), 'submitEditing');
    await waitFor(() => expect(mockService!.setMyPinPrice).toHaveBeenCalledWith('p1', 'GBP', 12));
    expect(await screen.findByText('Saved. Community price: £11 from 7 collectors.')).toBeTruthy();
    expect(screen.getByText('2 of 3 priced')).toBeTruthy();
  });

  it('clearing a box removes that price', async () => {
    await render(<PriceTradePinsScreen />);
    await waitFor(() => expect(field('Stitch Aloha').props.value).toBe('8'));
    await fireEvent.changeText(field('Stitch Aloha'), '');
    await fireEvent(field('Stitch Aloha'), 'blur');
    await waitFor(() => expect(mockService!.clearMyPinPrice).toHaveBeenCalledWith('p2', 'GBP'));
    expect(await screen.findByText('Price removed.')).toBeTruthy();
    expect(screen.getByText('0 of 3 priced')).toBeTruthy();
  });

  it('an unchanged box saves nothing; a bad one explains', async () => {
    await render(<PriceTradePinsScreen />);
    await waitFor(() => expect(field('Stitch Aloha').props.value).toBe('8'));
    await fireEvent(field('Stitch Aloha'), 'blur');
    await fireEvent.changeText(field('Winnie Honey'), 'lots');
    await fireEvent(field('Winnie Honey'), 'blur');
    expect(await screen.findByText('Enter a price like 12 or 12.50.')).toBeTruthy();
    expect(mockService!.setMyPinPrice).not.toHaveBeenCalled();
  });

  it('says so when prices are not available', async () => {
    mockService = null;
    await render(<PriceTradePinsScreen />);
    expect(screen.getByText("Prices aren't available yet")).toBeTruthy();
  });

  it('copes with hundreds of pins', async () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `m${i}`, title: `Pin ${String(i).padStart(3, '0')}`, collection: 'Big' }));
    mockCatalogue.pins = many;
    Object.assign(mockCollection, Object.fromEntries(many.map(p => [p.id, { pinId: p.id, status: 'for_trade', quantity: 1 }])));
    const started = Date.now();
    await render(<PriceTradePinsScreen />);
    await waitFor(() => expect(screen.getByText(/of 600 priced/)).toBeTruthy());
    expect(Date.now() - started).toBeLessThan(5000);
    expect(screen.queryAllByLabelText(/^Price for Pin/).length).toBeLessThan(100);
  });
});
