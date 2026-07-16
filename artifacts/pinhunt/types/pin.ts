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
}
