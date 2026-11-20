import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The whole board pipeline against an in-memory store, a fake model and a
// fake Pixian: detect → crop/quality → match → clean → approve. Checks the
// cost controls (what is and isn't sent to Pixian) and that nothing is
// published without a reviewer.

const mem = vi.hoisted(() => ({
  scans: new Map<string, Record<string, unknown>>(),
  items: new Map<string, Record<string, unknown>>(),
  objects: new Map<string, Buffer>(),
  pins: {} as Record<string, { title: string; imageUrl: string | null; pendingImages: number }>,
  pixianCalls: 0,
  published: [] as string[],
  publishOpts: [] as unknown[],
  nextId: 1,
  /** processBoardScan runs (each starts with getScan). */
  getScanCalls: 0,
  create: null as unknown as ReturnType<typeof vi.fn>,
  /** Pin & Pop reference images the comparison step can see, by pin id. */
  refs: new Map<string, string>(),
  /** Cleaned files another board also uses. */
  sharedCleaned: new Set<string>(),
  /** A tiny pin_images table: photo records the approve step creates. */
  images: [] as Array<{ id: string; status: string; pinhuntId: string; storagePath: string; source?: string; source_record_id?: string }>,
  /** When set, publishing fails once (e.g. a network error) after the record exists. */
  failPublishOnce: false,
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  isAiConfigured: () => true,
  getOpenAIClient: () => ({ chat: { completions: { create: mem.create } } }),
}));
vi.mock("../scanCandidates", () => ({
  findCandidates: async () => [
    { id: "PHUK-1", title: "Grogu with cup", brand: "Disney", collection: "Mandalorian", characters: ["Grogu"], imageUrl: undefined },
    { id: "PHUK-2", title: "Remy chef", brand: "Disney", collection: "Ratatouille", characters: ["Remy"], imageUrl: "https://cdn.test/remy.jpg" },
    { id: "PHUK-3", title: "Woody", brand: "Disney", collection: "Toy Story", characters: ["Woody"], imageUrl: undefined },
  ],
}));
vi.mock("../pixian", () => ({
  pixianConfigured: () => true,
  PixianTimeoutError: class extends Error {},
  normalizePinPhoto: async (b: Buffer) => { mem.pixianCalls++; return b; },
}));
vi.mock("./references", () => ({ fetchReferenceImage: async (url: string) => `data:image/jpeg;base64,${Buffer.from(url).toString("base64")}` }));
vi.mock("../scanReferenceImages", () => ({
  pinAndPopReferenceImages: async (ids: string[]) => new Map(ids.filter((i) => mem.refs.has(i)).map((i) => [i, mem.refs.get(i)!])),
}));
vi.mock("../contributed-images", () => ({
  publishContributedImage: async (image: { id: string }, _r: string, _d: unknown, opts: unknown) => {
    if (mem.failPublishOnce) { mem.failPublishOnce = false; throw new Error("network down"); }
    const row = mem.images.find((r) => r.id === image.id);
    if (row) row.status = "approved";
    mem.published.push(image.id); mem.publishOpts.push(opts); return image;
  },
}));
vi.mock("@workspace/pin-repository", () => ({
  createSupabasePinRepository: () => ({ getPinByPinhuntId: async (id: string) => ({ id, title: id, collection: "", imageUrl: undefined }) }),
  createSupabaseUserRepository: () => ({
    createContributedImage: async (_u: string, pinId: string, o: { storagePath: string }) => {
      const row = { id: `img-${pinId}${mem.images.some((r) => r.id === `img-${pinId}`) ? `-${mem.images.length}` : ""}`, status: "pending", pinhuntId: pinId, storagePath: o.storagePath };
      mem.images.push(row);
      return { ...row };
    },
    getContributedImage: async (iid: string) => { const r = mem.images.find((x) => x.id === iid); return r ? { ...r } : null; },
  }),
}));
/** Just enough of a Supabase query on pin_images for the approve step. */
function fakePinImages() {
  const filters: Array<[string, unknown]> = [];
  let op: "select" | "update" | "delete" = "select";
  let patch: Record<string, unknown> = {};
  const rows = () => mem.images.filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
  const q = {
    select: () => { op = "select"; return q; },
    update: (p: Record<string, unknown>) => { op = "update"; patch = p; return q; },
    delete: () => { op = "delete"; return q; },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
    order: () => q,
    limit: () => q,
    then: (resolve: (v: unknown) => void) => {
      if (op === "update") for (const r of rows()) Object.assign(r, patch);
      if (op === "delete") { const gone = new Set(rows()); mem.images = mem.images.filter((r) => !gone.has(r)); }
      resolve({ data: op === "select" ? rows().slice().reverse() : null, error: null });
    },
  };
  return q;
}

vi.mock("./store", async (importOriginal) => {
  const real = await importOriginal<typeof import("./store")>();
  const id = () => `id-${mem.nextId++}`;
  const now = () => new Date().toISOString();
  return {
    ...real,
    boardDb: () => ({ from: () => fakePinImages() }),
    getScan: async (sid: string) => { mem.getScanCalls++; return mem.scans.get(sid) ?? null; },
    // Merges stats the way the real store does.
    updateScan: async (sid: string, patch: Record<string, unknown>, opts: { resetStats?: boolean; replaceSetHints?: boolean } = {}) => {
      const scan = mem.scans.get(sid)!;
      if (patch.stats) {
        const cur = (scan.stats ?? {}) as Record<string, never>;
        const next = patch.stats as Record<string, never>;
        patch = { ...patch, stats: {
          ...(opts.resetStats ? {} : cur), ...next,
          setHints: opts.replaceSetHints ? next.setHints : real.mergeSetHints(cur.setHints, next.setHints),
          setVotes: opts.resetStats ? next.setVotes : real.mergeSetVotes(cur.setVotes, next.setVotes),
        } };
      }
      Object.assign(scan, patch, { updated_at: now() });
    },
    listItems: async (sid: string) => [...mem.items.values()].filter((i) => i.board_scan_id === sid).sort((a, b) => (a.position as number) - (b.position as number)),
    getItem: async (_s: string, iid: string) => mem.items.get(iid) ?? null,
    insertItems: async (rows: Record<string, unknown>[]) => rows.map((r) => {
      const row = {
        id: id(), match_status: "pending", candidates: [], suggested_pin_id: null, match_confidence: null, pin_has_image: null,
        decision: "undecided", decided_pin_id: null, exclude_reason: null, priority: 0, cleanup_status: "none", cleanup_note: null,
        cleaned_path: null, image_review: "none", pin_image_id: null, attempts: 0, error: null, created_at: now(), updated_at: now(), ...r,
      };
      mem.items.set(row.id as string, row);
      return row;
    }),
    updateItem: async (iid: string, patch: Record<string, unknown>) => Object.assign(mem.items.get(iid)!, patch),
    uploadObject: async (b: string, p: string, body: Buffer) => { mem.objects.set(`${b}/${p}`, body); },
    downloadObject: async (b: string, p: string) => {
      const o = mem.objects.get(`${b}/${p}`);
      if (!o) throw new Error(`missing ${b}/${p}`);
      return o;
    },
    findCleanedByCropHash: async () => null,
    removePendingBoardImages: async (ids: string[]) => {
      mem.images = mem.images.filter((r) => !(r.status === "pending" && ids.includes(r.source_record_id ?? "")));
    },
    deleteItemsForScan: async (sid: string) => { for (const [k, v] of mem.items) if (v.board_scan_id === sid) mem.items.delete(k); },
    deleteScan: async (sid: string) => { mem.scans.delete(sid); },
    listObjects: async (b: string, folder: string) => [...mem.objects.keys()].filter((k) => k.startsWith(`${b}/${folder}/`)).map((k) => k.slice(b.length + 1)),
    removeObjects: async (b: string, paths: string[]) => { for (const p of paths) mem.objects.delete(`${b}/${p}`); },
    cleanedPathsUsedElsewhere: async (paths: string[]) => new Set(paths.filter((p) => mem.sharedCleaned.has(p))),
    pinImageState: async (ids: string[]) => Object.fromEntries(ids.filter((i) => mem.pins[i]).map((i) => [i, mem.pins[i]])),
  };
});

import { approveItem, approveReady, cleanItem, cleanSetName, deleteBoard, enqueue, isRunning, learnSet, MAX_SET_HINTS, processBoardScan, refineBox, rescanBoard } from "./pipeline";
import type { BoardScan, BoardScanItem } from "./store";

/** A 2000×1500 "board": three sharp, textured pins and one tiny one. */
async function makeBoard() {
  const tex = (cx: number, cy: number, r: number, c: string) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>` +
    Array.from({ length: 12 }, (_, k) => `<line x1="${cx - r}" y1="${cy - r + k * r / 6}" x2="${cx + r}" y2="${cy - r + k * r / 6}" stroke="#000" stroke-width="3"/>`).join("");
  const svg = `<svg width="2000" height="1500"><rect width="2000" height="1500" fill="#6b4f2a"/>` +
    tex(300, 300, 200, "#3a7") + tex(1000, 300, 200, "#c33") + tex(1700, 300, 200, "#36c") + tex(1000, 1100, 40, "#ff0") + `</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

// Each pin carries distinct "printed text" so the fake model can tell the
// crops apart: matching runs several pins at once, so call order isn't fixed.
const detection = JSON.stringify({ pins: [
  { box: [50, 67, 250, 333], characters: ["Grogu"], keywords: ["Mandalorian"], text: "G1" },
  { box: [400, 67, 600, 333], characters: ["Remy"], keywords: ["chef"], text: "R2" },
  { box: [750, 67, 950, 333], characters: ["Woody"], keywords: [], text: "W3", occluded: true },
  { box: [480, 706, 520, 760], characters: [], keywords: [], text: "" },
] });
const rank = (id: string, conf: number) => JSON.stringify([{ pinId: id, confidence: conf, reasoning: "looks right" }]);

const EMPTY_DESCRIPTION = JSON.stringify({ characters: [], keywords: [], text: "" });

/**
 * A fake model: detection, the per-pin describe step, ranking (by the pin's
 * printed text, from `byText`) and the reference comparison (confirms the
 * ranking's first candidate at `verifiedConfidence`).
 */
function model(byText: Record<string, string>, opts: { describe?: string; verifiedConfidence?: number } = {}) {
  return async (req: { messages: Array<{ content: unknown }> }) => {
    const system = String(req.messages[0].content);
    if (system.startsWith("You find individual")) return reply(detection);
    if (system.startsWith("You identify Disney enamel pins")) return reply(opts.describe ?? EMPTY_DESCRIPTION);
    if (system.startsWith("You verify")) {
      const first = /PHUK-\d+/.exec(system)?.[0] ?? "PHUK-1";
      return reply(rank(first, opts.verifiedConfidence ?? 95));
    }
    const text = /Text seen on the pin: "([^"]*)"/.exec(system)?.[1] ?? "";
    return reply(byText[text] ?? "[]");
  };
}

function reply(content: string) {
  return { choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 100 } };
}

async function setup(publicDisplay = true) {
  mem.scans.clear(); mem.items.clear(); mem.objects.clear();
  mem.pixianCalls = 0; mem.published = []; mem.publishOpts = []; mem.nextId = 1; mem.refs = new Map(); mem.sharedCleaned = new Set();
  mem.images = []; mem.failPublishOnce = false;
  mem.pins = {
    "PHUK-1": { title: "Grogu", imageUrl: null, pendingImages: 0 },
    "PHUK-2": { title: "Remy", imageUrl: "https://cdn.test/remy.jpg", pendingImages: 0 },
    "PHUK-3": { title: "Woody", imageUrl: null, pendingImages: 0 },
  };
  mem.objects.set("board-scans/s1/board.jpg", await makeBoard());
  mem.scans.set("s1", {
    id: "s1", created_by: "admin-1", status: "queued", image_path: "s1/board.jpg", image_width: 2000, image_height: 1500,
    permission_public_display: publicDisplay, stats: {}, updated_at: new Date().toISOString(),
  });
  mem.create = vi.fn(async (req: { messages: Array<{ content: unknown }> }) =>
    String(req.messages[0].content).startsWith("You find individual") ? reply(detection) : reply("[]"));
}

describe("processBoardScan", () => {
  beforeEach(async () => {
    vi.stubEnv("BOARD_MIN_SHARPNESS", "10");
    vi.stubEnv("BOARD_MIN_CROP_SIDE_PX", "200");
    await setup();
  });

  it("detects, matches, prioritises and cleans only what's worth cleaning", async () => {
    // Grogu and Woody have Pin & Pop references; Remy has a catalogue photo.
    mem.refs = new Map([["PHUK-1", "https://pinandpop.test/1.jpg"], ["PHUK-3", "https://pinandpop.test/3.jpg"]]);
    // The tiny crop (no printed text) gets a weak answer.
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 92), R2: rank("PHUK-2", 90), W3: rank("PHUK-3", 91), "": rank("PHUK-3", 20) }));

    await processBoardScan("s1");
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    const items = [...mem.items.values()] as unknown as BoardScanItem[];
    expect(scan.status).toBe("ready");
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.suggested_pin_id)).toEqual(["PHUK-1", "PHUK-2", "PHUK-3", "PHUK-3"]);
    expect(items[3].match_status).toBe("unmatched");
    expect(items[3].quality?.reasons).toContain("low_resolution");
    expect(items[2].quality?.reasons).toContain("occluded");

    // Only Grogu: suitable, confident, no photo yet. Remy has a photo; Woody
    // is occluded; the tiny crop is unsuitable and unmatched.
    expect(items.map((i) => i.cleanup_status)).toEqual(["done", "skipped", "skipped", "skipped"]);
    expect(mem.pixianCalls).toBe(1);
    expect(items[0].priority).toBeGreaterThan(items[1].priority);
    // 1 detection + 4 describes + 4 rankings + 3 comparisons (the tiny crop's
    // ranking is implausible, so it isn't compared).
    expect(scan.stats).toMatchObject({ openaiCalls: 12, inputTokens: 12000, pixianCalls: 1 });
    expect(items.slice(0, 3).every((i) => i.candidates[0]?.verified)).toBe(true);
    // Nothing published without a reviewer.
    expect(mem.published).toEqual([]);

    // Nothing is bulk-published until a reviewer confirms the match, however
    // high the checked score.
    const before = await approveReady(scan, "admin-1");
    expect(before.approved).toEqual([]);
    expect(mem.published).toEqual([]);

    // The reviewer confirms Grogu, then publishes the ready pin in one go.
    Object.assign(items[0], { decision: "confirmed", decided_pin_id: "PHUK-1" });
    const result = await approveReady(scan, "admin-1");
    expect(result.approved).toEqual([items[0].id]);
    expect(mem.published).toEqual(["img-PHUK-1"]);
    expect(items[0]).toMatchObject({ image_review: "approved", decision: "confirmed", decided_pin_id: "PHUK-1" });
  });

  it("refuses to publish from a board without public display permission, and never cleans it", async () => {
    await setup(false);
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 95) }));
    await processBoardScan("s1");
    expect(mem.pixianCalls).toBe(0);
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    const item = [...mem.items.values()][0] as unknown as BoardScanItem;
    await expect(approveItem(scan, { ...item, cleanup_status: "done", cleaned_path: "x.jpg" }, "admin-1"))
      .rejects.toThrow(/public display/);
  });

  it("replaces a pin's existing photo only after the reviewer confirms it", async () => {
    await processBoardScan("s1");
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    const item = { ...([...mem.items.values()][1] as unknown as BoardScanItem), cleanup_status: "done", cleaned_path: "x.jpg" } as BoardScanItem;
    // Remy already has a catalogue photo.
    await expect(approveItem(scan, item, "admin-1", { pinId: "PHUK-2" })).rejects.toThrow(/already has a catalogue photo/);
    expect(mem.published).toEqual([]);
    await approveItem(scan, item, "admin-1", { pinId: "PHUK-2", replaceExisting: true });
    expect(mem.published).toEqual(["img-PHUK-2"]);
    // The confirmation reaches the shared publish step, which refuses a
    // replacement otherwise (services/contributed-images.ts).
    expect(mem.publishOpts).toEqual([{ replaceExisting: true }]);
  });

  it("can be retried after publishing failed, without a second photo record", async () => {
    await processBoardScan("s1");
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    const stored = [...mem.items.values()][0];
    Object.assign(stored, { cleanup_status: "done", cleaned_path: "x.jpg", decision: "confirmed", decided_pin_id: "PHUK-1" });
    mem.failPublishOnce = true;
    await expect(approveItem(scan, { ...stored } as unknown as BoardScanItem, "admin-1")).rejects.toThrow(/network down/);
    expect(mem.images).toHaveLength(1);
    expect(stored.pin_image_id).toBe("img-PHUK-1");
    await approveItem(scan, { ...stored } as unknown as BoardScanItem, "admin-1");
    expect(mem.images).toEqual([expect.objectContaining({ id: "img-PHUK-1", status: "approved", source_record_id: stored.id })]);
    expect(mem.published).toEqual(["img-PHUK-1"]);
  });

  it("drops a leftover record for a different pin before trying again", async () => {
    await processBoardScan("s1");
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    const stored = [...mem.items.values()][0];
    Object.assign(stored, { cleanup_status: "done", cleaned_path: "x.jpg", decision: "confirmed", decided_pin_id: "PHUK-3" });
    mem.failPublishOnce = true;
    await expect(approveItem(scan, { ...stored } as unknown as BoardScanItem, "admin-1")).rejects.toThrow();
    // The reviewer changes their mind about the pin, then approves again.
    Object.assign(stored, { decided_pin_id: "PHUK-1", decision: "corrected" });
    await approveItem(scan, { ...stored } as unknown as BoardScanItem, "admin-1");
    expect(mem.images.map((r) => [r.pinhuntId, r.status])).toEqual([["PHUK-1", "approved"]]);
  });

  it("never publishes a watermarked test-mode photo once test mode is off", async () => {
    vi.stubEnv("PIXIAN_TEST_MODE", "true");
    await processBoardScan("s1");
    const stored = [...mem.items.values()][0];
    Object.assign(stored, { decision: "confirmed", decided_pin_id: "PHUK-1" });
    await cleanItem(mem.scans.get("s1") as unknown as BoardScan, { ...stored, cleanup_status: "none" } as unknown as BoardScanItem,
      [...mem.items.values()] as unknown as BoardScanItem[], {}, { force: true });
    expect(stored.cleaned_path).toMatch(/\.pixian-test\.jpg$/);

    vi.stubEnv("PIXIAN_TEST_MODE", "false");
    Object.assign(stored, { decision: "confirmed", decided_pin_id: "PHUK-1" });
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    await expect(approveItem(scan, { ...stored } as unknown as BoardScanItem, "admin-1")).rejects.toMatchObject({ code: "test_mode_cleanup" });
    expect(mem.published).toEqual([]);
    // Back to "Clean photo" so a real clean-up can be made.
    expect(stored).toMatchObject({ cleanup_status: "skipped", cleaned_path: null });
    vi.unstubAllEnvs();
  });

  it("keeps going when one pin fails to match, and resumes only the failed pin", async () => {
    let failRemy = true;
    const answer = model({ G1: rank("PHUK-3", 50), R2: rank("PHUK-3", 50), W3: rank("PHUK-3", 50), "": rank("PHUK-3", 50) });
    mem.create.mockImplementation(async (req: { messages: Array<{ content: unknown }> }) => {
      const system = String(req.messages[0].content);
      if (failRemy && system.includes('Text seen on the pin: "R2"')) { failRemy = false; throw new Error("upstream 500"); }
      return answer(req);
    });
    await processBoardScan("s1");
    expect(mem.scans.get("s1")!.status).toBe("partial");
    const failed = [...mem.items.values()].filter((i) => i.match_status === "failed");
    expect(failed).toHaveLength(1);

    const callsBefore = mem.create.mock.calls.length;
    await processBoardScan("s1");
    expect(mem.scans.get("s1")!.status).toBe("ready");
    // No new detection and no new describe: one new ranking call.
    expect(mem.create.mock.calls.length - callsBefore).toBe(1);
  });

  it("never lets an unchecked ranking look confident or trigger a clean-up", async () => {
    // No reference images anywhere, so nothing can be compared.
    mem.pins["PHUK-1"].imageUrl = null;
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 97) }));
    await processBoardScan("s1");
    const grogu = [...mem.items.values()][0] as unknown as BoardScanItem;
    expect(grogu).toMatchObject({ suggested_pin_id: "PHUK-1", match_confidence: 60, cleanup_status: "skipped" });
    expect(grogu.candidates[0]).toMatchObject({ confidence: 60, verified: false });
    expect(mem.pixianCalls).toBe(0);
  });

  it("compares a confident ranking too, and reports no match when the picture disagrees", async () => {
    mem.refs = new Map([["PHUK-1", "https://pinandpop.test/1.jpg"]]);
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 97) }, { verifiedConfidence: 15 }));
    await processBoardScan("s1");
    const grogu = [...mem.items.values()][0] as unknown as BoardScanItem;
    const compared = mem.create.mock.calls.filter(([req]) => String(req.messages[0].content).startsWith("You verify"));
    expect(compared).toHaveLength(1);
    expect(grogu).toMatchObject({ match_status: "unmatched", cleanup_status: "skipped" });
    expect(grogu.candidates[0]).toMatchObject({ confidence: 15, verified: true });
  });

  it("describes each pin once with context, and re-crops to a tighter box", async () => {
    // In the 35%-padded context crop, the pin fills the middle part.
    const describe = JSON.stringify({ characters: ["Grogu"], keywords: ["teacup", "Mandalorian"], text: "", box: [0.2, 0.2, 0.8, 0.8] });
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 50) }, { describe }));
    await processBoardScan("s1");
    const grogu = [...mem.items.values()][0] as unknown as BoardScanItem;
    expect(grogu.detection).toMatchObject({ described: true, keywords: expect.arrayContaining(["teacup", "Mandalorian"]) });
    // Detected box was x 0.05–0.25. The context crop spans x 0–0.32 (0.35 padding,
    // clamped at the edge), so 0.2–0.8 of it is x 0.064–0.256: the same pin, tighter.
    expect(grogu.box.x).toBeCloseTo(0.064, 2);
    expect(grogu.box.x + grogu.box.w).toBeCloseTo(0.256, 2);
    const describes = mem.create.mock.calls.filter(([req]) => String(req.messages[0].content).startsWith("You identify Disney enamel pins"));
    expect(describes).toHaveLength(4);
  });

  it("learns a set once two confirmed pins share it, and re-matches the board's other undecided pins with it", async () => {
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 50), R2: rank("PHUK-2", 50), W3: rank("PHUK-3", 50), "": rank("PHUK-3", 50) }));
    await processBoardScan("s1");
    const [grogu, remy, woody] = [...mem.items.values()] as unknown as BoardScanItem[];
    Object.assign(grogu, { decision: "confirmed", decided_pin_id: "PHUK-1" });
    Object.assign(remy, { decision: "excluded", exclude_reason: "not_a_pin" });
    const ranksBefore = mem.create.mock.calls.length;

    // One confirmed pin isn't enough (confirming it twice doesn't count twice).
    expect(await learnSet(mem.scans.get("s1") as unknown as BoardScan, "Tails of Friendship", grogu.id)).toBe(0);
    expect(await learnSet(mem.scans.get("s1") as unknown as BoardScan, "Tails of Friendship", grogu.id)).toBe(0);
    expect(mem.scans.get("s1")!.stats).not.toHaveProperty("setHints", ["Tails of Friendship"]);

    // A second pin from the same set: the last undecided pin (the tiny one) is re-matched.
    Object.assign(woody, { decision: "confirmed", decided_pin_id: "PHUK-3" });
    expect(await learnSet(mem.scans.get("s1") as unknown as BoardScan, "tails of friendship", woody.id)).toBe(1);
    expect(mem.scans.get("s1")!.stats).toMatchObject({ setHints: ["tails of friendship"] });
    await vi.waitFor(() => expect(mem.scans.get("s1")!.status).toBe("ready"));
    await vi.waitFor(() => expect([...mem.items.values()].every((i) => i.match_status !== "pending")).toBe(true));
    const newCalls = mem.create.mock.calls.slice(ranksBefore).map(([req]) => String(req.messages[0].content));
    // No new describe (already described); the ranking is told about the set.
    expect(newCalls.some((c) => c.startsWith("You identify Disney enamel pins"))).toBe(false);
    expect(newCalls.filter((c) => c.includes('"tails of friendship"'))).toHaveLength(1);

    // A set the board already knows doesn't trigger another round.
    expect(await learnSet(mem.scans.get("s1") as unknown as BoardScan, "tails of friendship", grogu.id)).toBe(0);
  });

  it("runs a board again when asked while it's running, instead of dropping the request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const answer = model({ G1: rank("PHUK-1", 50) });
    mem.create.mockImplementation(async (req: { messages: Array<{ content: unknown }> }) => {
      if (String(req.messages[0].content).startsWith("You find individual")) await gate; // hold the first run
      return answer(req);
    });
    mem.getScanCalls = 0;
    enqueue("s1");
    await vi.waitFor(() => expect(mem.getScanCalls).toBe(1)); // first run started, held at detection
    enqueue("s1"); // e.g. a confirmation's re-match while it's still running
    release();
    await vi.waitFor(() => expect(isRunning("s1")).toBe(false));
    expect(mem.getScanCalls).toBe(2);
    expect(mem.scans.get("s1")!.status).toBe("ready");
  });

  it("learns at most MAX_SET_HINTS sets per board", async () => {
    const full = Array.from({ length: MAX_SET_HINTS }, (_, i) => `Set ${i}`);
    Object.assign(mem.scans.get("s1")!, { stats: { setHints: full } });
    expect(await learnSet(mem.scans.get("s1") as unknown as BoardScan, "Tails of Friendship", "x")).toBe(0);
    expect(mem.scans.get("s1")!.stats).toMatchObject({ setHints: full });
  });

  it("scans a board again from the start, with a new set, keeping the photo", async () => {
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 50) }));
    await processBoardScan("s1");
    const before = [...mem.items.keys()];
    expect(before).toHaveLength(4);
    const detections = () => mem.create.mock.calls.filter(([r]) => String(r.messages[0].content).startsWith("You find individual")).length;
    expect(detections()).toBe(1);
    // A set learned earlier (perhaps wrongly), and votes for another.
    Object.assign(mem.scans.get("s1")!.stats as object, { setHints: ["Wrong Set"], setVotes: { other: ["x"] } });

    await rescanBoard(mem.scans.get("s1") as unknown as BoardScan, "Tails of Friendship");
    await vi.waitFor(() => expect(isRunning("s1")).toBe(false));
    expect(mem.scans.get("s1")).toMatchObject({ status: "ready", stats: expect.objectContaining({ setHints: ["Tails of Friendship"] }) });
    expect((mem.scans.get("s1")!.stats as { setVotes?: unknown }).setVotes).toBeUndefined();
    expect(detections()).toBe(2); // detected again
    const after = [...mem.items.keys()];
    expect(after).toHaveLength(4);
    expect(after.some((k) => before.includes(k))).toBe(false); // all new pins
    expect(mem.objects.has("board-scans/s1/board.jpg")).toBe(true);
  });

  it("removes the old pins' cleaned photos when scanning again, but not one another board uses", async () => {
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 50) }));
    await processBoardScan("s1");
    const [a, b] = [...mem.items.values()];
    Object.assign(a, { cleaned_path: "admin-1/board-s1/a.jpg" });
    Object.assign(b, { cleaned_path: "admin-1/board-other/shared.jpg" });
    mem.objects.set("pin-contributed-images/admin-1/board-s1/a.jpg", Buffer.from("a"));
    mem.objects.set("pin-contributed-images/admin-1/board-other/shared.jpg", Buffer.from("b"));
    mem.sharedCleaned = new Set(["admin-1/board-other/shared.jpg"]);
    await rescanBoard(mem.scans.get("s1") as unknown as BoardScan);
    await vi.waitFor(() => expect(isRunning("s1")).toBe(false));
    expect(mem.objects.has("pin-contributed-images/admin-1/board-s1/a.jpg")).toBe(false);
    expect(mem.objects.has("pin-contributed-images/admin-1/board-other/shared.jpg")).toBe(true);
  });

  it("deletes a board, its images, and only the cleaned photos no other board uses", async () => {
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 50) }));
    await processBoardScan("s1");
    const [a, b] = [...mem.items.values()];
    Object.assign(a, { cleanup_status: "done", cleaned_path: "admin-1/board-s1/a.jpg" });
    Object.assign(b, { cleanup_status: "done", cleaned_path: "admin-1/board-other/shared.jpg" });
    mem.objects.set("pin-contributed-images/admin-1/board-s1/a.jpg", Buffer.from("a"));
    mem.objects.set("pin-contributed-images/admin-1/board-other/shared.jpg", Buffer.from("b"));
    mem.sharedCleaned = new Set(["admin-1/board-other/shared.jpg"]);

    await deleteBoard(mem.scans.get("s1") as unknown as BoardScan);
    expect(mem.scans.has("s1")).toBe(false);
    expect(mem.items.size).toBe(0);
    expect([...mem.objects.keys()].filter((k) => k.startsWith("board-scans/s1/"))).toEqual([]);
    expect(mem.objects.has("pin-contributed-images/admin-1/board-s1/a.jpg")).toBe(false);
    expect(mem.objects.has("pin-contributed-images/admin-1/board-other/shared.jpg")).toBe(true);
  });

  it("won't scan again or delete once a photo from the board is published", async () => {
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 50) }));
    await processBoardScan("s1");
    Object.assign([...mem.items.values()][0], { image_review: "approved" });
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    await expect(rescanBoard(scan)).rejects.toMatchObject({ status: 409, code: "board_has_published" });
    await expect(deleteBoard(scan)).rejects.toMatchObject({ status: 409, code: "board_has_published" });
    expect(mem.items.size).toBe(4);
    expect(mem.scans.has("s1")).toBe(true);
  });

  it("removes photo records a failed approval left pending when a board is scanned again or deleted", async () => {
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 50) }));
    await processBoardScan("s1");
    const [a, b] = [...mem.items.keys()];
    mem.images.push(
      { id: "left-a", status: "pending", pinhuntId: "PHUK-1", storagePath: "x.jpg", source: "pinhunt_board_scan", source_record_id: a },
      { id: "other-board", status: "pending", pinhuntId: "PHUK-2", storagePath: "y.jpg", source: "pinhunt_board_scan", source_record_id: "item-elsewhere" },
    );
    await rescanBoard(mem.scans.get("s1") as unknown as BoardScan);
    await vi.waitFor(() => expect(isRunning("s1")).toBe(false));
    expect(mem.images.map((r) => r.id)).toEqual(["other-board"]);

    const c = [...mem.items.keys()][0];
    mem.images.push({ id: "left-c", status: "pending", pinhuntId: "PHUK-1", storagePath: "z.jpg", source: "pinhunt_board_scan", source_record_id: c });
    await deleteBoard(mem.scans.get("s1") as unknown as BoardScan);
    expect(mem.images.map((r) => r.id)).toEqual(["other-board"]);
    expect(b).toBeDefined();
  });

  it("cleaning a rejected photo again puts it back under review; automatic clean-up leaves it alone", async () => {
    mem.create.mockImplementation(model({ G1: rank("PHUK-1", 50) }));
    await processBoardScan("s1");
    const grogu = [...mem.items.values()][0] as unknown as BoardScanItem;
    Object.assign(grogu, { decision: "confirmed", decided_pin_id: "PHUK-1", image_review: "rejected", cleanup_status: "skipped", cleaned_path: null });
    const calls = mem.pixianCalls;
    await processBoardScan("s1"); // e.g. a resume: the rejected photo isn't redone
    expect(mem.pixianCalls).toBe(calls);
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    const again = await cleanItem(scan, { ...grogu, cleanup_status: "none" }, [...mem.items.values()] as unknown as BoardScanItem[], {}, { force: true });
    expect(again).toMatchObject({ cleanup_status: "done", image_review: "none" });
  });

  it("cleans set names and ignores empty ones", () => {
    expect(cleanSetName("  Disney Store   Pin Trading Event 2026 - Tails of Friendship ")).toBe("Disney Store Pin Trading Event 2026 - Tails of Friendship");
    expect(cleanSetName("")).toBeNull();
    expect(cleanSetName(null)).toBeNull();
  });

  it("marks the board failed when detection itself fails", async () => {
    mem.create.mockRejectedValue(new Error("model unavailable"));
    await processBoardScan("s1");
    expect(mem.scans.get("s1")).toMatchObject({ status: "failed", error: "model unavailable" });
  });
});

describe("refineBox", () => {
  const detected = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
  it("maps a box from the context crop back onto the board", () => {
    // Context crop: 0.33–0.67 each way (0.35 padding). Its middle half is 0.415–0.585.
    const b = refineBox(detected, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 1000, 1000)!;
    expect(b.x).toBeCloseTo(0.415, 2);
    expect(b.w).toBeCloseTo(0.17, 2);
  });
  it("grows a box that cut the pin off", () => {
    const b = refineBox(detected, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 1000, 1000)!;
    expect(b.w).toBeGreaterThan(detected.w);
  });
  it("rejects a box on a different pin, or one far smaller or bigger", () => {
    expect(refineBox(detected, { x: 0, y: 0, w: 0.15, h: 0.15 }, 1000, 1000)).toBeNull();
    expect(refineBox(detected, { x: 0.48, y: 0.48, w: 0.04, h: 0.04 }, 1000, 1000)).toBeNull();
  });
});
