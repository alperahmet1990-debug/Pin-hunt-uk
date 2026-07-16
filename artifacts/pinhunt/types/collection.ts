import type { CollectionStatus } from './pin';

export interface CollectionEntry {
  pinId: string;
  status: CollectionStatus;
  notes: string;
  dateAdded: string;
}

export type CollectionMap = Record<string, CollectionEntry>;
