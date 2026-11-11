// Build-time feature flags. Code and routes stay in place; flags only hide entry points.
export const FEATURES = {
  // External marketplace surfaces (For Sale, List for Sale, My Marketplace Listings).
  // Off for the trade-first V1 launch.
  marketplaceListings: false,
  // Collectors Nearby, postcode entry and "Appear in Collectors Nearby" (LP-7, #525).
  // Off for V1: posted trades only, no location-based discovery.
  collectorsNearby: false,
  // "Open to Local Trades" and "Happy to Travel" (meet-up trading). Off for V1.
  inPersonTrading: false,
  // "International Trading" toggle and badges. Off for V1 (UK posted trades only).
  internationalTrading: false,
} as const;
