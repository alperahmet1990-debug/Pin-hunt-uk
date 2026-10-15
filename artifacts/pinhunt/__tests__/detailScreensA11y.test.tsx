/**
 * B-P1-25b (#53): every icon-only touchable on the detail screens has a
 * spoken name and a role, and no bare image is left for VoiceOver to read as
 * "image". Same tree walk as the tab screens (#52), in helpers/a11yTree.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { unlabelledImages, unlabelledPressables, type Node } from './helpers/a11yTree';

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockPins = [
  { id: 'p1', title: 'Mickey Classic', collection: 'Park Icons', characters: ['Mickey'], brand: 'Disneyland Paris', imageUrl: 'https://example.test/p1.jpg', limitedEditionSize: 500, estimatedValueGBP: 12 },
  { id: 'p2', title: 'Dumbo Blue Sky', collection: 'Park Icons', characters: ['Dumbo'], brand: 'Disneyland Paris' },
];
const mockConversation = {
  id: 'c1', participantAId: 'u1', participantBId: 'u2', createdAt: '2026-10-13T10:00:00Z',
  otherParticipant: { id: 'u2', username: 'bea', displayName: 'Bea' },
};
const mockMessages = [
  { id: 'm1', conversationId: 'c1', senderId: 'u2', body: 'Hi! Want to swap?', messageType: 'text', pinIds: [], forTradePinIds: [], photoUrls: [], createdAt: '2026-10-13T10:01:00Z' },
  { id: 'm2', conversationId: 'c1', senderId: 'u1', body: '', messageType: 'pin_share', pinIds: ['p1', 'p2'], forTradePinIds: ['p1'], photoUrls: [], createdAt: '2026-10-13T10:02:00Z' },
  { id: 'm3', conversationId: 'c1', senderId: 'u2', body: '', messageType: 'photo', pinIds: [], forTradePinIds: [], photoUrls: ['https://example.test/photo.jpg'], createdAt: '2026-10-13T10:03:00Z' },
];
const mockTrade = {
  id: 't1', initiatorId: 'u1', recipientId: 'u2', status: 'accepted', notes: 'Mickey for Dumbo',
  messages: [
    { id: 'tm1', tradeId: 't1', senderId: 'u2', message: 'Deal!', createdAt: '2026-10-13T11:00:00Z' },
    { id: 'tm2', tradeId: 't1', senderId: 'u1', message: 'Posting tomorrow', createdAt: '2026-10-13T11:05:00Z' },
  ],
  createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-13T11:05:00Z',
};
const page = { pins: mockPins, total: 2, hasMore: false };
const mockRepo = {
  getPinById: (id: string) => Promise.resolve(mockPins.find(p => p.id === id) ?? null),
  getPinsByIds: (ids: string[]) => Promise.resolve(mockPins.filter(p => ids.includes(p.id))),
  getPinsBySeries: () => Promise.resolve(mockPins),
  getCatalogueSourceDisplayName: () => Promise.resolve(null),
  getExternalListingsForPin: () => Promise.resolve([]),
  getUsersWithPinForTrade: () => Promise.resolve([]),
  searchPinsPage: () => Promise.resolve(page),
  getSetSummaries: () => Promise.resolve([{ name: 'Park Icons', releasedPinCount: 2 }]),
  getCatalogueBrowseIndex: () => Promise.resolve(mockPins.map(p => ({ id: p.id, title: p.title, setName: p.collection, imageUrl: p.imageUrl }))),
  getConversation: () => Promise.resolve(mockConversation),
  getConversationMessages: () => Promise.resolve(mockMessages),
  getCommunityPost: () => Promise.resolve(null),
  getTrade: () => Promise.resolve(mockTrade),
  getPotentialTrades: () => Promise.resolve([]),
  getTraderRating: () => Promise.resolve(null),
};
const mockCollection = { p1: { pinId: 'p1', status: 'owned', quantity: 2, dateAdded: '2026-10-01' } };
const mockEnsure = () => Promise.resolve();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true, setParams: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
  Redirect: () => null,
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(), MediaTypeOptions: {} }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: jest.fn() },
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: null, signOut: jest.fn() }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u1', username: 'demo', isAdmin: false }, loading: false }) }));
jest.mock('@/context/UnreadMessagesContext', () => ({ useUnreadMessages: () => ({ totalUnread: 0, markRead: jest.fn(), refresh: jest.fn() }) }));
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: false, loading: false }) }));
jest.mock('@/hooks/useMyAccess', () => ({ useMyAccess: () => ({ isAdmin: false, isAppCreator: false, isContributor: false, loading: false }) }));
jest.mock('@/hooks/useSetTraders', () => ({ useSetTraders: () => ({ available: [], loading: false }) }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    collection: mockCollection, getEntry: (id: string) => (mockCollection as Record<string, unknown>)[id],
    markViewed: jest.fn(), setStatus: jest.fn(), setStatuses: jest.fn(), restoreEntry: jest.fn(), restoreEntries: jest.fn(), adjustQuantity: jest.fn(),
  }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [], createBoard: jest.fn(), getBoardPins: () => [], addPinToBoard: jest.fn(), addPinsToBoard: jest.fn(), removePinFromBoard: jest.fn(), removePinsFromBoard: jest.fn() }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: mockRepo, ensurePins: mockEnsure, ensureCollections: mockEnsure, loading: false, series: ['Park Icons'] }),
}));

const SCREENS: [string, Record<string, string>, () => React.ComponentType][] = [
  ['Pin detail', { id: 'p1' }, () => require('../app/pin/[id]').default],
  ['Set detail', { collection: 'Park Icons' }, () => require('../app/set/[collection]').default],
  ['Search', {}, () => require('../app/search').default],
  ['Browse Catalogue', {}, () => require('../app/browse-catalogue').default],
  ['Chat', { id: 'c1' }, () => require('../app/community/chat/[id]').default],
  ['Trade', { id: 't1' }, () => require('../app/trade/[id]').default],
  ['Find a Trade', { pinId: 'p1' }, () => require('../app/traders/[pinId]').default],
];

describe('Detail screens: every touchable has a spoken name (#53)', () => {
  it.each(SCREENS)('%s', async (_name, params, load) => {
    mockParams = params;
    const Screen = load();
    const { toJSON } = await render(<Screen />);
    // Let the screens' loads (repository promises) settle and re-render.
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    const tree = toJSON() as Node | Node[] | null;
    expect(unlabelledPressables(tree)).toEqual([]);
    expect(unlabelledImages(tree)).toEqual([]);
  }, 30_000);
});

// UX-063 (#278): the content-first screens use the shared ScreenHeader
// (docs/design/screen-header.md), not the native stack header.
describe('ScreenHeader on Find a Trade and Browse Catalogue (#278)', () => {
  it.each([
    ['Find a Trade', { pinId: 'p1' }, () => require('../app/traders/[pinId]').default],
    ['Entire Catalogue', {}, () => require('../app/browse-catalogue').default],
  ] as [string, Record<string, string>, () => React.ComponentType][])('%s', async (title, params, load) => {
    mockParams = params;
    const Screen = load();
    await render(<Screen />);
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    expect(screen.getByTestId('screen-header')).toBeTruthy();
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  }, 30_000);
});

// UX-066 (#308): a pin with no photo shows the drawn placeholder and invites one.
describe('Pin detail with no photo (#308)', () => {
  it('shows the placeholder and an Add a photo card that opens photo contribution', async () => {
    mockParams = { id: 'p2' };
    const Screen = require('../app/pin/[id]').default;
    await render(<Screen />);
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    expect(screen.getByLabelText('Dumbo Blue Sky. No photo yet')).toBeTruthy();
    expect(screen.getByTestId('add-photo-card')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/contribute-image/[pinId]', params: { pinId: 'p2' } });
  }, 30_000);

  it('a pin with a photo has no Add a photo card', async () => {
    mockParams = { id: 'p1' };
    const Screen = require('../app/pin/[id]').default;
    await render(<Screen />);
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByTestId('add-photo-card')).toBeNull();
  }, 30_000);
});
