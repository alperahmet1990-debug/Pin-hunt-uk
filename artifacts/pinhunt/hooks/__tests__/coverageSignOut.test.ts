import type { CatalogueImageCoverage } from '@workspace/pin-repository';

// Coverage rows hold the caller's own photo status: a sign-out forgets them.
let mockAuthListener: ((event: string) => void) | null = null;
jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { onAuthStateChange: (cb: (event: string) => void) => { mockAuthListener = cb; return { data: { subscription: { unsubscribe() {} } } }; } } },
}));

// Loaded after the mock's listener variable exists (imports are hoisted above it).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __rememberForTests, getCachedCoverage, markCoveragePending } = require('../useCatalogueCoverage') as typeof import('../useCatalogueCoverage');

describe('coverage cache and sign-out', () => {
  it('is cleared when the account signs out, and kept on other auth events', () => {
    expect(mockAuthListener).not.toBeNull();
    // Seed the cache through the public API used after a contribution.
    const row: CatalogueImageCoverage = { pinhuntId: 'PHUK-1', title: 'X', setName: 'S', imageSource: null, pendingCount: 0 };
    __rememberForTests([row]);
    expect(getCachedCoverage('PHUK-1')).toBeDefined();
    markCoveragePending('PHUK-1');
    mockAuthListener!('TOKEN_REFRESHED');
    expect(getCachedCoverage('PHUK-1')?.myStatus).toBe('pending');
    mockAuthListener!('SIGNED_OUT');
    expect(getCachedCoverage('PHUK-1')).toBeUndefined();
  });
});
