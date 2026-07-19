/**
 * Marketplace URL validation for the "Sell Securely" flow.
 *
 * Rules:
 *  - vinted  → must be a vinted.* domain
 *  - ebay    → must be an ebay.* domain
 *  - other   → any valid https:// URL
 *
 * We never scrape or call marketplace APIs — we only validate the URL
 * structure so buyers land on the correct platform.
 */

import type { ExternalSaleListingPlatform } from '@workspace/pin-repository';

const VINTED_DOMAINS = [
  'vinted.co.uk', 'vinted.com', 'vinted.fr', 'vinted.de',
  'vinted.nl', 'vinted.be', 'vinted.es', 'vinted.it', 'vinted.pl',
];

const EBAY_DOMAINS = [
  'ebay.co.uk', 'ebay.com', 'ebay.fr', 'ebay.de', 'ebay.com.au',
  'ebay.ca', 'ebay.es', 'ebay.it', 'ebay.at', 'ebay.ch', 'ebay.ie',
];

export interface MarketplaceUrlValidation {
  valid: boolean;
  error?: string;
}

export function validateMarketplaceUrl(
  platform: ExternalSaleListingPlatform,
  url: string,
): MarketplaceUrlValidation {
  const trimmed = url.trim();
  if (!trimmed) return { valid: false, error: 'Listing URL is required.' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Please enter a valid URL (e.g. https://www.vinted.co.uk/…).' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'URL must start with https://.' };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

  if (platform === 'vinted') {
    if (!VINTED_DOMAINS.includes(hostname)) {
      return {
        valid: false,
        error: `URL must be from Vinted (e.g. vinted.co.uk or vinted.com). Got: ${hostname}`,
      };
    }
  } else if (platform === 'ebay') {
    if (!EBAY_DOMAINS.includes(hostname)) {
      return {
        valid: false,
        error: `URL must be from eBay (e.g. ebay.co.uk or ebay.com). Got: ${hostname}`,
      };
    }
  }
  // 'other' — any valid https URL is accepted

  return { valid: true };
}

export interface PlatformConfig {
  label: string;
  color: string;
  icon: string;
  exampleUrl: string;
  instruction: string;
}

export const PLATFORM_CONFIG: Record<ExternalSaleListingPlatform, PlatformConfig> = {
  vinted: {
    label: 'Vinted',
    color: '#09B1BA',
    icon: 'shopping-bag',
    exampleUrl: 'https://www.vinted.co.uk/items/…',
    instruction:
      'Create your listing on Vinted first, then paste the listing URL here. Buyers will be sent to Vinted to purchase.',
  },
  ebay: {
    label: 'eBay',
    color: '#E53238',
    icon: 'tag',
    exampleUrl: 'https://www.ebay.co.uk/itm/…',
    instruction:
      'Create your listing on eBay first, then paste the listing URL here. Buyers will be sent to eBay to purchase.',
  },
  other: {
    label: 'Other',
    color: '#6366F1',
    icon: 'external-link',
    exampleUrl: 'https://…',
    instruction:
      'Paste the URL of your listing on any other marketplace. Make sure it is a direct link to your item.',
  },
};

export const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
};
