// Build-time feature flags. Code and routes stay in place; flags only hide entry points.
export const FEATURES = {
  // External marketplace surfaces (For Sale, List for Sale, My Marketplace Listings).
  // Off for the trade-first V1 launch.
  marketplaceListings: false,
} as const;
