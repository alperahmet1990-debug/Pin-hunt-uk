/**
 * Legacy mock pin format — used only as the offline fallback in PinCatalogueContext.
 * All app screens use CataloguePin from @workspace/pin-repository.
 */
export interface MockPin {
  id: string;
  title: string;
  brand: string;
  collection: string;
  characters: string[];
  releaseDate?: string;
  retailPrice: number;
  estimatedValueGBP: number;
  origin?: string;
  edition?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  image: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backImage?: any;
  description?: string;
  isNewRelease?: boolean;
  limitedEditionSize?: number;
}

export const PINS: MockPin[] = [
  // ── Disney Parks ────────────────────────────────────────────────────────────
  {
    id: 'dp-001',
    title: 'Mickey Classic Silhouette',
    brand: 'Disney Parks',
    collection: 'Classics 2024',
    characters: ['Mickey Mouse'],
    releaseDate: '2024-01-15',
    retailPrice: 14.99,
    estimatedValueGBP: 18,
    origin: 'Walt Disney World',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-01.png'),
    description:
      'A timeless gold-backed silhouette pin celebrating the iconic mouse ears. A must-have for any Parks collection.',
    isNewRelease: false,
  },
  {
    id: 'dp-002',
    title: 'Minnie Bow & Polka Dot',
    brand: 'Disney Parks',
    collection: 'Classics 2024',
    characters: ['Minnie Mouse'],
    releaseDate: '2024-01-15',
    retailPrice: 14.99,
    estimatedValueGBP: 16,
    origin: 'Walt Disney World',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-02.png'),
    description:
      "Minnie's signature pink polka-dot bow rendered in vibrant enamel. A sweet addition to any collector's board.",
  },
  {
    id: 'dp-003',
    title: 'Castle Fireworks Night',
    brand: 'Disney Parks',
    collection: 'Park Icons',
    characters: [],
    releaseDate: '2023-11-20',
    retailPrice: 17.99,
    limitedEditionSize: 2500,
    estimatedValueGBP: 32,
    origin: 'Disneyland Paris',
    edition: 'LE 2500',
    image: require('../assets/images/pins/pin-03.png'),
    description:
      "The park's fairy-tale castle silhouetted against a burst of fireworks. Limited to 2,500 worldwide.",
  },
  {
    id: 'dp-004',
    title: 'Tinker Bell Sparkle Trail',
    brand: 'Disney Parks',
    collection: 'Fairy Tale Friends',
    characters: ['Tinker Bell'],
    releaseDate: '2024-05-01',
    retailPrice: 15.99,
    estimatedValueGBP: 19,
    origin: 'Walt Disney World',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-04.png'),
    description:
      'Tink leaves a glittery trail across a teal sky. Perfect for fans of the fairies series.',
    isNewRelease: true,
  },
  {
    id: 'dp-005',
    title: 'Stitch Aloha Hawaiian',
    brand: 'Disney Parks',
    collection: 'Tropical Vibes',
    characters: ['Stitch'],
    releaseDate: '2024-06-01',
    retailPrice: 15.99,
    estimatedValueGBP: 22,
    origin: 'Disneyland Resort',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-05.png'),
    description:
      "Everyone's favourite blue alien in a tropical shirt. Ohana means family — and this pin means good vibes.",
    isNewRelease: true,
  },
  {
    id: 'dp-006',
    title: 'Dumbo Blue Sky Journey',
    brand: 'Disney Parks',
    collection: 'Park Icons',
    characters: ['Dumbo'],
    releaseDate: '2023-09-10',
    retailPrice: 14.99,
    estimatedValueGBP: 14,
    origin: 'Walt Disney World',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-06.png'),
    description:
      'The little elephant soaring above white clouds on a soft cerulean background. Classic and charming.',
  },
  {
    id: 'dp-007',
    title: 'Haunted Mansion Hitchhikers',
    brand: 'Disney Parks',
    collection: 'Haunted Mansion 50th',
    characters: ['Hitchhiking Ghosts'],
    releaseDate: '2023-10-31',
    retailPrice: 19.99,
    limitedEditionSize: 1500,
    estimatedValueGBP: 55,
    origin: 'Walt Disney World',
    edition: 'LE 1500',
    image: require('../assets/images/pins/pin-07.png'),
    description:
      'Three ghostly hitchhikers behind the iconic gothic gate. Part of the exclusive 50th anniversary set.',
  },
  {
    id: 'dp-008',
    title: 'Space Mountain Star Blazer',
    brand: 'Disney Parks',
    collection: 'Tomorrowland',
    characters: [],
    releaseDate: '2024-02-14',
    retailPrice: 17.99,
    limitedEditionSize: 3000,
    estimatedValueGBP: 28,
    origin: 'Disneyland Paris',
    edition: 'LE 3000',
    image: require('../assets/images/pins/pin-08.png'),
    description:
      'A gleaming rocket streaking through a starfield. Limited edition from the Tomorrowland series.',
  },
  {
    id: 'dp-009',
    title: 'Pirates Treasure Trove',
    brand: 'Disney Parks',
    collection: 'Adventure Seas',
    characters: ['Jack Sparrow'],
    releaseDate: '2023-07-27',
    retailPrice: 14.99,
    estimatedValueGBP: 17,
    origin: 'Walt Disney World',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-09.png'),
    description:
      "Overflowing with golden doubloons on a teal ocean backdrop. Yo ho, a collector's life for me.",
  },
  {
    id: 'dp-010',
    title: 'Winnie Honey Time',
    brand: 'Disney Parks',
    collection: 'Hundred Acre Friends',
    characters: ['Winnie the Pooh'],
    releaseDate: '2023-05-12',
    retailPrice: 14.99,
    estimatedValueGBP: 15,
    origin: 'Tokyo Disney Resort',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-10.png'),
    description:
      "Pooh's round honey pot dripping with golden goodness on a sunshine-yellow background. Oh, bother — it's adorable.",
  },

  // ── Loungefly ────────────────────────────────────────────────────────────────
  {
    id: 'lf-001',
    title: 'Wonderland Tea Party',
    brand: 'Loungefly',
    collection: 'Storybook Series Vol. 1',
    characters: ['Alice', 'Mad Hatter'],
    releaseDate: '2024-04-05',
    retailPrice: 16.99,
    estimatedValueGBP: 24,
    origin: 'Online Exclusive',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-01.png'),
    description:
      "A whimsical tea cup scene in pastel lavender and cream. Part of Loungefly's beloved Storybook enamel line.",
    isNewRelease: true,
  },
  {
    id: 'lf-002',
    title: "Ariel's Sea Garden",
    brand: 'Loungefly',
    collection: 'Undersea Dreams',
    characters: ['Ariel'],
    releaseDate: '2023-12-01',
    retailPrice: 16.99,
    estimatedValueGBP: 21,
    origin: 'Online Exclusive',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-02.png'),
    description:
      'A coral reef in bloom with a shimmering tail fin at centre. Beautifully detailed for a Loungefly exclusive.',
  },
  {
    id: 'lf-003',
    title: "Belle's Library Rose",
    brand: 'Loungefly',
    collection: 'Enchanted Series',
    characters: ['Belle', 'Beast'],
    releaseDate: '2024-02-01',
    retailPrice: 18.99,
    limitedEditionSize: 2000,
    estimatedValueGBP: 38,
    origin: 'Online Exclusive',
    edition: 'LE 2000',
    image: require('../assets/images/pins/pin-03.png'),
    description:
      'An enchanted red rose under a glass dome, backed by golden library shelves. Limited to 2,000 pieces.',
  },
  {
    id: 'lf-004',
    title: "Aurora's Golden Dream",
    brand: 'Loungefly',
    collection: 'Storybook Series Vol. 1',
    characters: ['Aurora', 'Maleficent'],
    releaseDate: '2024-04-05',
    retailPrice: 16.99,
    estimatedValueGBP: 22,
    origin: 'Online Exclusive',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-04.png'),
    description:
      'A spinning wheel wrapped in fairy-tale roses, gold and violet on blush pink. Pairs beautifully with the Tea Party pin.',
  },
  {
    id: 'lf-005',
    title: 'Snow White Apple Garden',
    brand: 'Loungefly',
    collection: 'Storybook Series Vol. 2',
    characters: ['Snow White', 'Evil Queen'],
    releaseDate: '2024-07-01',
    retailPrice: 16.99,
    estimatedValueGBP: 20,
    origin: 'Online Exclusive',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-05.png'),
    description:
      'A ruby-red apple in a cottage garden, rendered in jewel-toned enamel. Vol. 2 is just landing.',
    isNewRelease: true,
  },

  // ── BoxLunch ─────────────────────────────────────────────────────────────────
  {
    id: 'bl-001',
    title: "Simba's Pride Dawn",
    brand: 'BoxLunch',
    collection: 'Circle of Life',
    characters: ['Simba', 'Mufasa'],
    releaseDate: '2024-05-15',
    retailPrice: 15.99,
    estimatedValueGBP: 21,
    origin: 'BoxLunch Retail',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-06.png'),
    description:
      "A young cub silhouetted on Pride Rock against a blazing African sunrise. BoxLunch's Circle of Life tribute.",
    isNewRelease: true,
  },
  {
    id: 'bl-002',
    title: "Aladdin's Magic Journey",
    brand: 'BoxLunch',
    collection: 'Desert Nights',
    characters: ['Aladdin', 'Jasmine', 'Genie'],
    releaseDate: '2023-08-20',
    retailPrice: 15.99,
    estimatedValueGBP: 18,
    origin: 'BoxLunch Retail',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-07.png'),
    description:
      'A magic carpet sailing past starlit minarets in deep cobalt and burnt gold. Three wishes included — not really.',
  },
  {
    id: 'bl-003',
    title: 'Mulan Cherry Blossom',
    brand: 'BoxLunch',
    collection: 'Warriors & Legends',
    characters: ['Mulan', 'Mushu'],
    releaseDate: '2024-03-08',
    retailPrice: 17.99,
    limitedEditionSize: 1800,
    estimatedValueGBP: 34,
    origin: 'BoxLunch Retail',
    edition: 'LE 1800',
    image: require('../assets/images/pins/pin-08.png'),
    description:
      "Cherry blossoms frame a red and gold dragon detail. Released on International Women's Day — 1,800 made.",
  },
  {
    id: 'bl-004',
    title: 'Moana Wave Rider',
    brand: 'BoxLunch',
    collection: 'Ocean Explorers',
    characters: ['Moana', 'Maui'],
    releaseDate: '2023-10-01',
    retailPrice: 15.99,
    estimatedValueGBP: 19,
    origin: 'BoxLunch Retail',
    edition: 'Open Edition',
    image: require('../assets/images/pins/pin-09.png'),
    description:
      'A curling ocean wave in turquoise and white, with a stylised fishhook motif. The sea calls.',
  },
  {
    id: 'bl-005',
    title: 'Raya Dragon Heart',
    brand: 'BoxLunch',
    collection: 'Warriors & Legends',
    characters: ['Raya', 'Sisu'],
    releaseDate: '2024-07-10',
    retailPrice: 17.99,
    limitedEditionSize: 2200,
    estimatedValueGBP: 29,
    origin: 'BoxLunch Retail',
    edition: 'LE 2200',
    image: require('../assets/images/pins/pin-10.png'),
    description:
      'A luminous dragon gem in deep teal and violet with gold filigree. Part of the Warriors & Legends series — just 2,200 made.',
    isNewRelease: true,
  },
];

export const NEW_RELEASES = PINS.filter(p => p.isNewRelease);
