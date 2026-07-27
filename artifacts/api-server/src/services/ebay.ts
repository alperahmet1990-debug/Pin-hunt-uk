/**
 * eBay API service — application-level OAuth (client-credentials) + Browse API search.
 *
 * Credentials stay strictly server-side. Tokens are cached in memory until
 * shortly before expiry. Credentials and full tokens are never logged.
 */
import { logger } from "../lib/logger";

export type EbayMarketplace = "EBAY_GB" | "EBAY_US";

export interface EbayListing {
  itemId: string;
  title: string;
  itemUrl?: string;
  imageUrl?: string;
  /** Item price in the marketplace currency. */
  itemPrice?: number;
  /** Cheapest delivery cost, or undefined when not available. */
  deliveryPrice?: number;
  currency?: string;
  condition?: string;
  /** Seller item location country code, when eBay reports it. */
  sellerLocation?: string;
}

function getEnvironment(): "production" | "sandbox" {
  return process.env.EBAY_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
}

function getBaseUrls() {
  const env = getEnvironment();
  return env === "sandbox"
    ? { auth: "https://api.sandbox.ebay.com", api: "https://api.sandbox.ebay.com" }
    : { auth: "https://api.ebay.com", api: "https://api.ebay.com" };
}

export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Get an application access token, cached until ~1 minute before expiry. */
async function getAccessToken(): Promise<string> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET must be set.");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const { auth } = getBaseUrls();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(`${auth}/identity/v1/oauth2/token`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }).toString(),
  });

  if (!resp.ok) {
    logger.error({ status: resp.status }, "eBay token request failed");
    throw new Error(`eBay authentication failed (HTTP ${resp.status}).`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

/**
 * Search current active listings via the Browse API.
 * Returns a normalized listing array; throws on auth/network failure.
 */
export async function searchListings(
  marketplace: EbayMarketplace,
  query: string,
  limit = 50,
): Promise<EbayListing[]> {
  const token = await getAccessToken();
  const { api } = getBaseUrls();
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    // Fixed-price (Buy It Now) only: auction listings report the *current bid*,
    // which skews estimates low. Sold-price data needs a restricted eBay API.
    filter: "buyingOptions:{FIXED_PRICE}",
  });
  const resp = await fetch(
    `${api}/buy/browse/v1/item_summary/search?${params.toString()}`,
    {
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplace,
        "Content-Type": "application/json",
      },
    },
  );

  if (resp.status === 401 || resp.status === 403) {
    // Token may have been revoked — drop cache so the next call re-authenticates.
    cachedToken = null;
    logger.warn({ status: resp.status, marketplace }, "eBay search auth error");
    throw new Error(`eBay authorization error (HTTP ${resp.status}).`);
  }
  if (!resp.ok) {
    logger.warn({ status: resp.status, marketplace }, "eBay search failed");
    throw new Error(`eBay search failed (HTTP ${resp.status}).`);
  }

  const data = (await resp.json()) as {
    itemSummaries?: Array<{
      itemId: string;
      title: string;
      itemWebUrl?: string;
      image?: { imageUrl?: string };
      price?: { value?: string; currency?: string };
      condition?: string;
      itemLocation?: { country?: string };
      shippingOptions?: Array<{
        shippingCost?: { value?: string; currency?: string };
      }>;
    }>;
  };

  return (data.itemSummaries ?? []).map(item => {
    const shippingValues = (item.shippingOptions ?? [])
      .map(o => (o.shippingCost?.value != null ? Number(o.shippingCost.value) : undefined))
      .filter((v): v is number => v != null && Number.isFinite(v));
    return {
      itemId: item.itemId,
      title: item.title,
      // eBay often returns .com web URLs even for GB-marketplace searches;
      // point UK results at ebay.co.uk so buyers land on the UK listing page.
      itemUrl:
        marketplace === "EBAY_GB" && item.itemWebUrl
          ? item.itemWebUrl.replace(/^https:\/\/www\.ebay\.com\//, "https://www.ebay.co.uk/")
          : item.itemWebUrl,
      imageUrl: item.image?.imageUrl,
      itemPrice: item.price?.value != null ? Number(item.price.value) : undefined,
      deliveryPrice: shippingValues.length > 0 ? Math.min(...shippingValues) : undefined,
      currency: item.price?.currency,
      condition: item.condition,
      sellerLocation: item.itemLocation?.country,
    };
  });
}
