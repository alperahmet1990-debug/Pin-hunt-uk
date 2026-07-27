export interface Board {
  id: string;
  name: string;
  pinIds: string[]; // manually curated pin IDs (custom boards)
  createdAt: string;
  isCustom: boolean; // false = auto-suggested from a collection
  suggestedCollection?: string; // collection name that generated this board
  thumbnailPinId?: string; // pin chosen as the board's cover image
}
