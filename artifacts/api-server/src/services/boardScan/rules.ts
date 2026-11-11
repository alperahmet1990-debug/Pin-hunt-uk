/**
 * Board scanning — pure decision rules (no I/O), so they're easy to test
 * and tune: review priority, when a crop is worth sending to Pixian, which
 * items a bulk approval may publish, and the per-board metrics.
 */
import type { BoardScan, BoardScanItem, BoardScanStats } from "./store";
import { targetPinId } from "./store";

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/** Match confidence at which a crop is cleaned without the reviewer asking. */
export const autoCleanMinConfidence = () => envNumber("BOARD_AUTO_CLEAN_MIN_CONFIDENCE", 70);
/** Match confidence at which "approve all ready" may publish an unconfirmed suggestion. */
export const bulkApproveMinConfidence = () => envNumber("BOARD_BULK_APPROVE_MIN_CONFIDENCE", 80);

/**
 * Review order: pins the catalogue has no photo of come first, then crops
 * good enough to publish, then by confidence.
 */
export function itemPriority(item: Pick<BoardScanItem, "decision" | "pin_has_image" | "quality" | "match_confidence" | "match_status">): number {
  if (item.decision === "excluded") return -100;
  const missing = item.pin_has_image === false ? 100 : item.pin_has_image === true ? 0 : 40;
  const usable = item.quality?.suitable ? 30 : 0;
  const conf = Math.round((item.match_confidence ?? 0) / 10);
  return missing + usable + conf;
}

export type CleanupBlock =
  | "no_public_permission"
  | "excluded"
  | "no_crop"
  | "no_match"
  | "already_cleaned"
  | "already_published"
  | "unsuitable"
  | "low_confidence"
  | "pin_has_photo"
  | "pin_has_pending_photo"
  | "duplicate_of_better_crop";

export const CLEANUP_BLOCK_TEXT: Record<CleanupBlock, string> = {
  no_public_permission: "This board's owner hasn't allowed public display, so its crops can't become catalogue photos.",
  excluded: "Excluded from this board.",
  no_crop: "No crop for this pin.",
  no_match: "Choose the catalogue pin first.",
  already_cleaned: "Already cleaned.",
  already_published: "Already published.",
  unsuitable: "Crop isn't good enough for a catalogue photo",
  low_confidence: "Match not confident enough to clean automatically — confirm it first.",
  pin_has_photo: "This pin already has a catalogue photo.",
  pin_has_pending_photo: "A photo of this pin is already waiting for review.",
  duplicate_of_better_crop: "A better crop of the same pin is on this board.",
};

/** Blocks that a reviewer can override by asking for the clean-up explicitly. */
const OVERRIDABLE: ReadonlySet<CleanupBlock> = new Set([
  "unsuitable", "low_confidence", "pin_has_photo", "pin_has_pending_photo", "duplicate_of_better_crop",
]);

export interface PinState {
  imageUrl: string | null;
  pendingImages: number;
}

/**
 * Whether to send this crop to Pixian. Every check here exists to avoid
 * paying for a clean-up that could never be published or isn't needed.
 * `force` (a reviewer asked) only lifts the judgement calls, never the
 * permission or "nothing to clean" checks.
 */
export function cleanupBlock(
  scan: Pick<BoardScan, "permission_public_display">,
  item: BoardScanItem,
  siblings: BoardScanItem[],
  pin: PinState | undefined,
  force = false,
): CleanupBlock | null {
  const hard = (): CleanupBlock | null => {
    if (!scan.permission_public_display) return "no_public_permission";
    if (item.decision === "excluded") return "excluded";
    if (!item.crop_path) return "no_crop";
    if (item.image_review === "approved") return "already_published";
    if (item.cleanup_status === "done") return "already_cleaned";
    if (!targetPinId(item)) return "no_match";
    return null;
  };
  const h = hard();
  if (h) return h;

  const soft = (): CleanupBlock | null => {
    if (!item.quality?.suitable) return "unsuitable";
    const reviewed = item.decision === "confirmed" || item.decision === "corrected";
    if (!reviewed && (item.match_confidence ?? 0) < autoCleanMinConfidence()) return "low_confidence";
    if (pin?.imageUrl) return "pin_has_photo";
    if (pin && pin.pendingImages > 0) return "pin_has_pending_photo";
    const target = targetPinId(item);
    const better = siblings.some((s) =>
      s.id !== item.id &&
      targetPinId(s) === target &&
      (s.cleanup_status === "done" || (s.quality?.score ?? 0) > (item.quality?.score ?? 0) ||
        ((s.quality?.score ?? 0) === (item.quality?.score ?? 0) && s.position < item.position)));
    if (better) return "duplicate_of_better_crop";
    return null;
  };
  const s = soft();
  if (s && force && OVERRIDABLE.has(s)) return null;
  return s;
}

/** Why an item can't be published by "approve all ready", or null if it can. */
export function bulkApproveBlock(
  scan: Pick<BoardScan, "permission_public_display">,
  item: BoardScanItem,
  pin: PinState | undefined,
): string | null {
  if (!scan.permission_public_display) return "no public display permission";
  if (item.decision === "excluded") return "excluded";
  if (item.image_review !== "none") return `already ${item.image_review}`;
  if (item.cleanup_status !== "done" || !item.cleaned_path) return "not cleaned";
  const target = targetPinId(item);
  if (!target) return "no match";
  const reviewed = item.decision === "confirmed" || item.decision === "corrected";
  if (!reviewed && (item.match_confidence ?? 0) < bulkApproveMinConfidence()) return "match needs confirming";
  if (pin?.imageUrl) return "pin already has a photo";
  return null;
}

export interface BoardMetrics {
  detected: number;
  manualAdds: number;
  falsePositives: number;
  /** Real pins on the board as far as review has established. */
  pinsOnBoard: number;
  /** Share of real pins that detection found (needs review to be complete). */
  detectionRate: number | null;
  reviewedMatches: number;
  matchedCorrectly: number;
  corrected: number;
  /** Of reviewed detected pins, share whose top suggestion was right. */
  matchAccuracy: number | null;
  suitableCrops: number;
  cleaned: number;
  published: number;
  imagesRejected: number;
  manualCorrections: number;
  undecided: number;
  pixianCalls: number;
  openaiCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  totalSeconds: number | null;
}

/**
 * Measurements for one board, derived from what the reviewer did: manual
 * adds are missed pins, "not a pin" exclusions are false detections,
 * corrections are wrong matches. Accurate once the board is fully reviewed.
 */
export function boardMetrics(scan: Pick<BoardScan, "stats">, items: BoardScanItem[]): BoardMetrics {
  const detected = items.filter((i) => i.origin === "detected");
  const manualAdds = items.filter((i) => i.origin === "manual").length;
  const falsePositives = detected.filter((i) => i.decision === "excluded" && i.exclude_reason === "not_a_pin").length;
  const duplicates = detected.filter((i) => i.decision === "excluded" && i.exclude_reason === "duplicate").length;
  const realDetected = detected.length - falsePositives - duplicates;
  const pinsOnBoard = realDetected + manualAdds;
  const reviewed = detected.filter((i) => i.decision === "confirmed" || i.decision === "corrected");
  const matchedCorrectly = reviewed.filter((i) => i.decision === "confirmed" && i.decided_pin_id === i.suggested_pin_id).length;
  const corrected = reviewed.length - matchedCorrectly;
  const stats: BoardScanStats = scan.stats ?? {};

  const inPrice = Number(process.env.BOARD_COST_USD_PER_M_INPUT);
  const outPrice = Number(process.env.BOARD_COST_USD_PER_M_OUTPUT);
  const pixianPrice = Number(process.env.PIXIAN_COST_USD_PER_IMAGE);
  const priced = Number.isFinite(inPrice) && Number.isFinite(outPrice) && process.env.BOARD_COST_USD_PER_M_INPUT;
  const estimatedCostUsd = priced
    ? Math.round((((stats.inputTokens ?? 0) * inPrice + (stats.outputTokens ?? 0) * outPrice) / 1e6 +
        (Number.isFinite(pixianPrice) ? (stats.pixianCalls ?? 0) * pixianPrice : 0)) * 1000) / 1000
    : null;

  return {
    detected: detected.length,
    manualAdds,
    falsePositives,
    pinsOnBoard,
    detectionRate: pinsOnBoard ? Math.round((realDetected / pinsOnBoard) * 1000) / 1000 : null,
    reviewedMatches: reviewed.length,
    matchedCorrectly,
    corrected,
    matchAccuracy: reviewed.length ? Math.round((matchedCorrectly / reviewed.length) * 1000) / 1000 : null,
    suitableCrops: items.filter((i) => i.decision !== "excluded" && i.quality?.suitable).length,
    cleaned: items.filter((i) => i.cleanup_status === "done").length,
    published: items.filter((i) => i.image_review === "approved").length,
    imagesRejected: items.filter((i) => i.image_review === "rejected").length,
    manualCorrections: corrected + manualAdds + falsePositives + duplicates,
    undecided: items.filter((i) => i.decision === "undecided").length,
    pixianCalls: stats.pixianCalls ?? 0,
    openaiCalls: stats.openaiCalls ?? 0,
    inputTokens: stats.inputTokens ?? 0,
    outputTokens: stats.outputTokens ?? 0,
    estimatedCostUsd,
    totalSeconds: stats.totalMs != null ? Math.round(stats.totalMs / 100) / 10 : null,
  };
}
