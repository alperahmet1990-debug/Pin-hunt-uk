import { resolveScanMatches } from '../resolveScanMatches';
import type { CataloguePin } from '@workspace/pin-repository';

const pin = (id: string) => ({ id }) as unknown as CataloguePin;
const raw = (...ids: string[]) => ids.map(pinId => ({ pinId, confidence: 0.9, reasoning: 'r' }));

describe('resolveScanMatches (#669)', () => {
  it('all lookups reject → no results and the error is reported', async () => {
    const boom = new Error('timeout');
    const r = await resolveScanMatches(raw('a', 'b'), [], async () => { throw boom; });
    expect(r.resolved).toEqual([]);
    expect(r.hadLookupError).toBe(true);
    expect(r.lookupError).toBe(boom);
  });

  it('all lookups resolve to null → no results, no error (genuine no-match)', async () => {
    const r = await resolveScanMatches(raw('a', 'b'), [], async () => null);
    expect(r.resolved).toEqual([]);
    expect(r.hadLookupError).toBe(false);
  });

  it('some lookups resolve → results returned', async () => {
    const r = await resolveScanMatches(raw('a', 'b'), [pin('a')], async () => { throw new Error('x'); });
    expect(r.resolved.map(m => m.pin.id)).toEqual(['a']);
    expect(r.hadLookupError).toBe(true);
  });

  it('uses the cache without calling the repository', async () => {
    const get = jest.fn();
    const r = await resolveScanMatches(raw('a'), [pin('a')], get);
    expect(r.resolved).toHaveLength(1);
    expect(get).not.toHaveBeenCalled();
  });
});
