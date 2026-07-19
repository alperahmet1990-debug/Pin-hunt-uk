export type Brand = 'Disney Parks' | 'Loungefly' | 'BoxLunch';
export type CollectionStatus = 'owned' | 'wanted' | 'for_trade' | 'none';

export interface Pin {
  id: string;
  title: string;
  brand: Brand;
  collection: string;
  characters: string[];
  releaseDate: string;
  retailPrice: number; // GBP
  limitedEditionSize?: number;
  estimatedValueGBP: number; // mock/sample value
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  image: any; // require() result
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  backImage?: any;
  description: string;
  isNewRelease?: boolean;
  /** Where the pin was originally sold, e.g. "Walt Disney World", "Disneyland Paris" */
  origin: string;
  /** Edition type, e.g. "Open Edition", "LE 2500", "WDI", "Artist Series" */
  edition: string;
}
