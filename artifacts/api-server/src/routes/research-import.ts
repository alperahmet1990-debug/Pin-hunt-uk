/**
 * Research import (#237 dry run, #241 import). App Creator only.
 * See docs/research/research-import-design.md.
 *
 * POST /api/admin/research/import/dry-run   { candidateIds: uuid[] }  writes nothing
 * POST /api/admin/research/import           { candidateIds: uuid[] }  creates NEW, non-public pins
 *
 * The import is all-or-nothing. It re-judges every candidate with the dry-run rules and
 * refuses the whole batch if any one is ineligible. It then mints pinhunt_ids with
 * next_pinhunt_id(), inserts pins (verification_status needs_source_verification, so not
 * public), and marks each candidate imported. Any failure after the batch row exists is
 * compensated: the batch's pins are deleted, its candidates reset to approved, and the
 * batch marked failed. It never updates an existing pin.
 */
import { createHash } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import { MAX_IMPORT_BATCH, judgeBatch, parseCandidateIds } from "../lib/research-import";
import { UUID, fail, getAdminClient, requireAppCreator, type CreatorRequest } from "./research-review";

const router: IRouter = Router();
const BAD_IDS = `Send between 1 and ${MAX_IMPORT_BATCH} different candidate ids`;

router.post("/admin/research/import/dry-run", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const ids = parseCandidateIds((req.body ?? {}).candidateIds, UUID);
  if (!ids) { res.status(400).json({ error: BAD_IDS }); return; }
  try {
    const verdicts = await judgeBatch(getAdminClient(), ids);
    res.json({
      dryRun: true,
      wouldCreate: verdicts.filter(v => v.ok).map(v => ({ candidateId: v.candidateId, row: v.row })),
      refused: verdicts.filter(v => !v.ok).map(({ candidateId, reason, message, missing }) => ({ candidateId, reason, message, missing })),
    });
  } catch (err) { fail(res, "import dry run", err); }
});

router.post("/admin/research/import", requireAppCreator, async (req: CreatorRequest, res: Response) => {
  const ids = parseCandidateIds((req.body ?? {}).candidateIds, UUID);
  if (!ids) { res.status(400).json({ error: BAD_IDS }); return; }
  const db = getAdminClient();
  let batchId: string | null = null;
  try {
    const verdicts = await judgeBatch(db, ids);
    const refused = verdicts.filter(v => !v.ok);
    if (refused.length) {
      res.status(409).json({
        error: "Nothing was imported: every candidate in the batch must be eligible. Run the dry run and remove the refused ones.",
        refused: refused.map(({ candidateId, reason, message, missing }) => ({ candidateId, reason, message, missing })),
      });
      return;
    }

    const now = new Date().toISOString();
    const { data: batch, error: batchErr } = await db.from("import_batches").insert({
      filename: `research-import-${now.slice(0, 10)}`,
      file_hash: createHash("sha256").update([...ids].sort().join(",")).digest("hex"),
      status: "running", total_rows: ids.length, imported_by: req.creatorId,
    }).select("id").single();
    if (batchErr || !batch) throw batchErr ?? new Error("import batch insert returned nothing");
    batchId = batch.id as string;

    // Mint ids first so a failure here leaves no pins behind.
    const minted: string[] = [];
    for (let i = 0; i < verdicts.length; i++) {
      const { data: pinhuntId, error: mintErr } = await db.rpc("next_pinhunt_id");
      if (mintErr || typeof pinhuntId !== "string") throw mintErr ?? new Error("next_pinhunt_id returned nothing");
      minted.push(pinhuntId);
    }

    const rows = verdicts.map((v, i) => ({ ...v.row, pinhunt_id: minted[i], import_batch_id: batchId }));
    const { data: inserted, error: insErr } = await db.from("pins").insert(rows).select("id, pinhunt_id");
    if (insErr) throw insErr;
    const pinIdByPinhunt = new Map(((inserted ?? []) as Array<{ id: string; pinhunt_id: string }>).map(p => [p.pinhunt_id, p.id]));
    if (pinIdByPinhunt.size !== rows.length) throw new Error("pin insert returned an unexpected row count");

    const created: Array<{ candidateId: string; pinId: string; pinhuntId: string }> = [];
    for (let i = 0; i < verdicts.length; i++) {
      const pinId = pinIdByPinhunt.get(minted[i])!;
      // Status-guarded: a candidate changed since judging is not overwritten; the batch fails instead.
      const { data: moved, error: upErr } = await db.from("catalogue_candidates").update({
        status: "imported", imported_pin_id: pinId, import_batch_id: batchId, updated_at: new Date().toISOString(),
      }).eq("id", verdicts[i].candidateId).eq("status", "approved").select("id");
      if (upErr) throw upErr;
      if (!moved?.length) throw new Error(`candidate ${verdicts[i].candidateId} changed during import`);
      created.push({ candidateId: verdicts[i].candidateId, pinId, pinhuntId: minted[i] });
    }

    const { error: doneErr } = await db.from("import_batches").update({
      status: "completed", inserted_rows: created.length, seed_rows: created.length, completed_at: new Date().toISOString(),
    }).eq("id", batchId);
    if (doneErr) throw doneErr;
    res.json({ ok: true, batchId, created, visibility: "needs_source_verification (not public)" });
  } catch (err) {
    if (batchId) await compensate(db, batchId, err);
    fail(res, "research import", err);
  }
});

/** Undo a partly written batch: delete its new pins, reset its candidates, mark it failed. */
async function compensate(db: ReturnType<typeof getAdminClient>, batchId: string, cause: unknown) {
  try {
    await db.from("catalogue_candidates").update({ status: "approved", imported_pin_id: null, import_batch_id: null })
      .eq("import_batch_id", batchId).eq("status", "imported");
    await db.from("pins").delete().eq("import_batch_id", batchId).eq("verification_status", "needs_source_verification");
    await db.from("import_batches").update({
      status: "failed", completed_at: new Date().toISOString(),
      error_report: { message: cause instanceof Error ? cause.message.slice(0, 300) : "import failed" },
    }).eq("id", batchId);
  } catch {
    // Compensation is best effort; the batch row keeps status 'running' for a person to resolve by import_batch_id.
  }
}

export default router;
