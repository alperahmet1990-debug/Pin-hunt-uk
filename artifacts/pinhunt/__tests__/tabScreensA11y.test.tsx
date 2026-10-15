/**
 * B-P1-25a (#52): every icon-only touchable on the five tab screens has a
 * spoken name. Walks the rendered tree: anything pressable must carry an
 * accessibilityLabel or contain visible text that becomes its name.
 */
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { render } from '@testing-library/react-native';
import { unlabelledImages, unlabelledPressables, type Node } from './helpers/a11yTree';

let mockParams: Record<string, string> = {};
const noopPromise = () => Promise.resolve([]);
const mockPost = {
  id: 'post1', authorId: 'u2', postType: 'for_trade', body: 'Trading my spare Stitch', photos: ['https://example.test/a.jpg'],
  authorProfile: { id: 'u2', username: 'bea', displayName: 'Bea' }, commentCount: 2, priceText: '£12', lookingFor: 'Dumbo',
  createdAt: '2026-10-13T10:00:00Z', updatedAt: '2026-10-13T10:00:00Z',
};
const mockRepo = {
  getCommunityFeed: () => Promise.resolve([mockPost]), getCommunityPost: () => Promise.resolve(null),
  getPinsByIds: noopPromise, getSetSummaries: noopPromise,
};
const mockCollection = { p1: { pinId: 'p1', status: 'owned', quantity: 2, dateAdded: '2026-10-01' } };
const mockPins = [{ id: 'p1', title: 'Mickey', collection: 'Park Icons', characters: [] }];
const mockEnsure = () => Promise.resolve();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
  Stack: { Screen: () => null },
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: jest.fn() },
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: null, signOut: jest.fn() }) }));
jest.mock('@/context/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u1', username: 'demo', isAdmin: false }, loading: false }) }));
jest.mock('@/context/UnreadMessagesContext', () => ({ useUnreadMessages: () => ({ totalUnread: 2 }) }));
jest.mock('@/context/SubmissionNotificationsContext', () => ({ useSubmissionNotifications: () => ({ unseenCount: 1 }) }));
jest.mock('@/hooks/useCommunity', () => ({ useCommunity: () => ({ repo: mockRepo, userId: 'u1' }) }));
jest.mock('@/hooks/useFeature', () => ({ useFeature: () => ({ enabled: false, loading: false }) }));
jest.mock('@/components/PhotoGapsCard', () => ({ PhotoGapsCard: () => null }));
jest.mock('@/context/CollectionContext', () => ({
  useCollection: () => ({
    collection: mockCollection, getEntry: (id: string) => (mockCollection as Record<string, unknown>)[id],
    markViewed: jest.fn(), setStatus: jest.fn(), setStatuses: jest.fn(), restoreEntry: jest.fn(), restoreEntries: jest.fn(), adjustQuantity: jest.fn(),
  }),
}));
jest.mock('@/context/BoardsContext', () => ({
  useBoards: () => ({ customBoards: [{ id: 'b1', name: 'Favourites', pinIds: ['p1'] }], createBoard: jest.fn(), getBoardPins: () => mockPins, addPinsToBoard: jest.fn(), removePinsFromBoard: jest.fn() }),
}));
jest.mock('@/context/PinCatalogueContext', () => ({
  usePinCatalogue: () => ({ pins: mockPins, repository: mockRepo, ensurePins: mockEnsure, ensureCollections: mockEnsure, loading: false }),
}));

const SCREENS: [string, () => React.ComponentType][] = [
  ['Home', () => require('../app/(tabs)/index').default],
  ['Community', () => require('../app/(tabs)/community').default],
  ['Find', () => require('../app/(tabs)/scan').default],
  ['Collection', () => require('../app/(tabs)/collection').default],
  ['Profile', () => require('../app/(tabs)/profile').default],
  ['Collection · Sets', () => { mockParams = { tab: 'sets' }; return require('../app/(tabs)/collection').default; }],
  ['Collection · ISO', () => { mockParams = { tab: 'iso' }; return require('../app/(tabs)/collection').default; }],
];

describe('Tab screens: every touchable has a spoken name (#52)', () => {
  it.each(SCREENS)('%s', async (_name, load) => {
    mockParams = {};
    const Screen = load();
    const { toJSON } = await render(<Screen />);
    await new Promise(r => setTimeout(r, 0));
    const tree = toJSON() as Node | Node[] | null;
    expect(unlabelledPressables(tree)).toEqual([]);
    expect(unlabelledImages(tree)).toEqual([]);
  }, 30_000);
});

describe('the checks themselves', () => {
  it('flag an icon-only button with no name and a text button with no role', async () => {
    const { toJSON } = await render(
      <View>
        <TouchableOpacity onPress={() => {}}><Feather name="x" size={12} /></TouchableOpacity>
        <TouchableOpacity onPress={() => {}}><Text>Save</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => {}}><Feather name="x" size={12} /></TouchableOpacity>
      </View>,
    );
    expect(unlabelledPressables(toJSON() as Node)).toEqual(['"" (role: none)', '"Save" (role: none)']);
  });

  it('flag a bare image but not a hidden or labelled one', async () => {
    const { toJSON } = await render(
      <View>
        <Image source={{ uri: 'a' }} />
        <Image source={{ uri: 'b' }} accessible={false} />
        <Image source={{ uri: 'c' }} accessibilityLabel="Stitch pin" />
      </View>,
    );
    expect(unlabelledImages(toJSON() as Node)).toEqual(['Image "a"']);
  });
});
