import { createMockApi, type RawCandidate } from '@/lib/researchPreview/mockApi';

const pin = (key: string, over: Partial<RawCandidate> = {}): RawCandidate => ({
  research_key: key, entity_type: 'pin', set_research_key: 'wdw/2024/set', record_confidence: 'High', engine_verified: true,
  proposed: { 'Pin name': key, 'Release year': 2024, 'Edition type': 'Limited Edition', 'Expected pin count': 3 },
  evidence: [{ field: 'characters', value: 'Mickey', source_url: 'https://example.org/a', method: 'engine' }], ...over,
});
const raw = [pin('wdw/2024/a'), pin('wdw/2024/b'), pin('wdw/2024/c', { record_confidence: 'Low' })];
const idOf = (api: ReturnType<typeof createMockApi>, key: string) =>
  (api.handle('GET', '/admin/research/catalogue?limit=200')[1] as any).candidates.find((c: any) => c.research_key === key).id;

describe('research preview mock API', () => {
  it('applies the same decision rules as the API', () => {
    const api = createMockApi(raw);
    const a = idOf(api, 'wdw/2024/a');
    expect(api.handle('POST', `/admin/research/candidates/${a}/decision`, { decision: 'approve' })[0]).toBe(409);
    expect(api.handle('POST', `/admin/research/candidates/${a}/decision`, { decision: 'reject', notes: '' })[0]).toBe(409);
    api.handle('POST', `/admin/research/candidates/${a}/direct-check`, { fields: ['characters'], sourceUrl: 'https://example.org/a' });
    expect(api.handle('POST', `/admin/research/candidates/${a}/decision`, { decision: 'approve' })).toEqual([200, { ok: true, status: 'approved' }]);
    const c = idOf(api, 'wdw/2024/c');
    api.handle('POST', `/admin/research/candidates/${c}/direct-check`, { fields: ['characters'], sourceUrl: 'https://example.org/c' });
    expect(api.handle('POST', `/admin/research/candidates/${c}/decision`, { decision: 'approve' })[1]).toEqual({ error: 'Identity confidence is too low to approve' });
  });

  it('round-trips decisions through snapshot and restore by research key', () => {
    const api = createMockApi(raw);
    const b = idOf(api, 'wdw/2024/b');
    api.handle('POST', '/admin/research/catalogue/decisions', { candidateIds: [b], decision: 'needs_more_research', notes: 'count unclear' });
    api.handle('POST', `/admin/research/candidates/${b}/flag`, { note: 'Wrong year?' });
    const snap = api.snapshot();
    expect(Object.keys(snap.decisions)).toEqual(['wdw/2024/b']);

    // Another device, with the runs in a different order: ids differ, keys match.
    const other = createMockApi([...raw].reverse());
    expect(other.restore(JSON.parse(JSON.stringify(snap)))).toEqual({ applied: 1, skipped: 0 });
    const needed = other.handle('GET', '/admin/research/catalogue/research-needed')[1] as any;
    expect(needed.items).toEqual([expect.objectContaining({ research_key: 'wdw/2024/b', status: 'needs_more_research', notes: 'count unclear', flags: ['Wrong year?'] })]);

    // Importing the same file again replaces, rather than duplicates, the pin's preview checks.
    other.restore(snap);
    expect((other.handle('GET', '/admin/research/catalogue/research-needed')[1] as any).items[0].flags).toEqual(['Wrong year?']);
  });

  it('skips unknown pins and invalid entries on restore', () => {
    const api = createMockApi(raw);
    const result = api.restore({ decisions: {
      'wdw/1999/gone': { status: 'rejected', decision_notes: 'x', decided_at: null, review: [] },
      'wdw/2024/a': { status: 'imported', decision_notes: null, decided_at: null, review: [] },
      'wdw/2024/b': { status: 'direct_verified', decision_notes: null, decided_at: null,
        review: [{ field: 'characters', value: { confirmed: true }, source_url: 'javascript:alert(1)' }] },
    } });
    expect(result).toEqual({ applied: 1, skipped: 2 });
    const b = idOf(api, 'wdw/2024/b');
    const ev = (api.handle('GET', `/admin/research/candidates/${b}`)[1] as any).evidence;
    expect(ev.at(-1)).toMatchObject({ method: 'human_direct_check', source_url: null });
  });

  it('records spreadsheet checks and reports which pins are ready to validate', () => {
    const api = createMockApi(raw);
    const [status, data] = api.handle('POST', '/admin/research/catalogue/checks', { checks: [
      { research_key: 'wdw/2024/a', check: 'OK' }, { research_key: 'wdw/2024/c', check: 'ok' },
      { research_key: 'wdw/2024/b', check: 'Research needed', note: 'year' }, { research_key: 'nope', check: 'ok' },
    ] }) as [number, any];
    expect(status).toBe(200);
    expect(data.ready.map((r: any) => r.research_key)).toEqual(['wdw/2024/a']);
    expect(data.held).toEqual([{ research_key: 'wdw/2024/c', reason: 'Identity confidence is too low to approve' }]);
    expect(data.recorded).toEqual({ ok: 2, research_needed: 1, flagged: 0 });
    expect(data.unknownCount).toBe(1);
  });

  it('reports set completeness from expected counts without inventing members', () => {
    const api = createMockApi(raw.slice(0, 2));
    const sets = (api.handle('GET', '/admin/research/catalogue/sets?only=incomplete')[1] as any).sets;
    expect(sets).toEqual([expect.objectContaining({ set_research_key: 'wdw/2024/set', expected: 3, identified: 2, missing: 1 })]);
  });
});
