import { validateMarketplaceUrl } from '../marketplaceUrl';

describe('validateMarketplaceUrl', () => {
  it('requires a URL', () => {
    expect(validateMarketplaceUrl('vinted', '   ').valid).toBe(false);
  });

  it('rejects non-https URLs', () => {
    expect(validateMarketplaceUrl('other', 'http://example.com/pin').valid).toBe(false);
  });

  it('accepts a Vinted URL with or without www', () => {
    expect(validateMarketplaceUrl('vinted', 'https://www.vinted.co.uk/items/1').valid).toBe(true);
    expect(validateMarketplaceUrl('vinted', 'https://vinted.fr/items/1').valid).toBe(true);
  });

  it('rejects a lookalike domain for eBay', () => {
    const result = validateMarketplaceUrl('ebay', 'https://ebay.co.uk.evil.example/itm/1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('eBay');
  });

  it('accepts any https URL for other platforms', () => {
    expect(validateMarketplaceUrl('other', 'https://pins.example/listing').valid).toBe(true);
  });
});
