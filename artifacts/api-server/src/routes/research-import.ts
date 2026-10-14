/**
 * Research import DRY RUN (#237). App Creator only. Writes nothing: it reports
 * the pins an import would create, or why each candidate would be refused.
 * The real import is a separate L3 step (docs/research/research-import-design.md).
 *
 * POST /api/admin/research/import/dry-run   { candidateIds: uuid[] }
 */
import { Router, type IRouter, type Response } from "express";
import {
  MAX_IMPORT_BATCH, judgeCandidate, type ImportCandidate, type Verdict,
} from "../lib/research-import";
import { UUID, fail, getAdminClient, requireAppCreator, type CreatorRequest } from "./research-review";

const router: IRouter = Router();

router.post("/admin/research/import/dry-run", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const raw = (req.body ?? {}).candidateIds;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IMPORT_BATCH
    || !raw.every(x => typeof x === "string" && UUID.test(x)) || new Set(raw).size !== raw.length) {
    res.status(400).json({ error: `Send between 1 and ${MAX_IMPORT_BATCH} different candidate ids` });
    return;
  }
  const ids = raw as string[];
  try {
    const db = getAdminClient();
    const { data, error } = await db.from("catalogue_candidates")
      .select("id, entity_type, status, proposed, review_reasons, warnings, duplicate_status, duplicate_pin_id, direct_verified_by, decided_by")
      .in("id", ids).limit(MAX_IMPORT_BATCH);
    if (error) throw error;
    const found = new Map(((data ?? []) as unknown as ImportCandidate[]).map(c => [c.id, c]));

    // Read-only catalogue lookup: live pins that share a title with the batch.
    const titles = [...new Set([...found.values()]
      .map(c => (typeof c.proposed?.["Pin name"] === "string" ? (c.proposed["Pin name"] as string).trim() : ""))
      .filter(Boolean))];
    const existingKeys = new Set<string>();
    if (titles.length) {
      const { data: pins, error: pinErr } = await db.from("pins").select("title, collection").in("title", titles).limit(1000);
      if (pinErr) throw pinErr;
      for (const p of pins ?? []) existingKeys.add(`${p.title}|${p.collection ?? ""}`.toLowerCase());
    }

    const verdicts: Verdict[] = ids.map(id => {
      const c = found.get(id);
      return c ? judgeCandidate(c, existingKeys)
        : { candidateId: id, ok: false, reason: "not_found", message: "Candidate not found" };
    });
    res.json({
      dryRun: true,
      wouldCreate: verdicts.filter(v => v.ok).map(v => ({ candidateId: v.candidateId, row: v.row })),
      refused: verdicts.filter(v => !v.ok).map(({ candidateId, reason, message, missing }) => ({ candidateId, reason, message, missing })),
    });
  } catch (err) { fail(res, "import dry run", err); }
});

export default router;
