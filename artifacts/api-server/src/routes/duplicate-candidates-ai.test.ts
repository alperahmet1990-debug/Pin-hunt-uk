import { describe, expect, it } from "vitest";
import { createSupabaseUserRepository } from "@workspace/pin-repository";

// Contributor programme admin review (#395): stored AI matches become
// duplicate candidates. The real repository runs against a fake client.

// ── A minimal fake Supabase client for the repository ────────────────────────
type Row = Record<string, unknown>;
function fakeClient(tables: { submission: Row; pins: Row[] }) {
  const calls: Array<{ table: string; ops: string[] }> = [];
  const from = (table: string) => {
    const entry = { table, ops: [] as string[] };
    calls.push(entry);
    let inIds: string[] | null = null;
    const q: Record<string, unknown> = {};
    for (const op of ["select", "is", "or", "eq", "ilike", "contains", "limit"]) {
      q[op] = () => { entry.ops.push(op); return q; };
    }
    q.in = (_col: string, ids: string[]) => { entry.ops.push("in"); inIds = ids; return q; };
    q.maybeSingle = async () => ({ data: tables.submission, error: null });
    q.then = (resolve: (v: unknown) => void) => resolve({
      data: table === "pins" && inIds ? tables.pins.filter(p => inIds!.includes(p.pinhunt_id as string)) : [],
      error: null,
    });
    return q;
  };
  return { client: { from } as never, calls };
}

const baseSubmission: Row = {
  id: "sub-1", submitted_by: "user-1", proposed_name: null, brand: null,
  front_image_path: "user-1/sub-1/front.jpg", status: "submitted", edition_type: "unknown",
  created_at: "2026-10-18T00:00:00Z", updated_at: "2026-10-18T00:00:00Z",
};

describe("findSubmissionDuplicateCandidates: AI matches (#395)", () => {
  it("an unnamed submission gets its stored AI matches, with their confidence", async () => {
    const { client } = fakeClient({
      submission: { ...baseSubmission, ai_identification: { matches: [{ pinId: "PHUK-00000001", confidence: 86.4 }] } },
      pins: [{ pinhunt_id: "PHUK-00000001", title: "Stitch Surfing", brand: "Disney", collection: "Lilo & Stitch", release_year: 2024, image_url: null }],
    });
    const { candidates, failedChecks } = await createSupabaseUserRepository(client).findSubmissionDuplicateCandidates("sub-1");
    expect(failedChecks).toEqual([]);
    expect(candidates).toEqual([expect.objectContaining({ pinhuntId: "PHUK-00000001", matchReason: "AI match (86%)" })]);
  });

  it("without AI matches or a name, there is nothing to look up", async () => {
    const { client, calls } = fakeClient({ submission: baseSubmission, pins: [] });
    const { candidates } = await createSupabaseUserRepository(client).findSubmissionDuplicateCandidates("sub-1");
    expect(candidates).toEqual([]);
    expect(calls.filter(c => c.table === "pins")).toHaveLength(0);
  });
});
