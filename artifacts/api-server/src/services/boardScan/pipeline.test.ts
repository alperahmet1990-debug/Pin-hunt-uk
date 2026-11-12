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
  nextId: 1,
  create: null as unknown as ReturnType<typeof vi.fn>,
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
vi.mock("../scanReferenceImages", () => ({ pinAndPopReferenceImages: async () => new Map() }));
vi.mock("../contributed-images", () => ({
  publishContributedImage: async (image: { id: string }) => { mem.published.push(image.id); return image; },
}));
vi.mock("@workspace/pin-repository", () => ({
  createSupabasePinRepository: () => ({ getPinByPinhuntId: async (id: string) => ({ id, title: id, collection: "", imageUrl: undefined }) }),
  createSupabaseUserRepository: () => ({
    createContributedImage: async (_u: string, pinId: string) => ({ id: `img-${pinId}`, pinhuntId: pinId }),
  }),
}));
vi.mock("./store", async (importOriginal) => {
  const real = await importOriginal<typeof import("./store")>();
  const id = () => `id-${mem.nextId++}`;
  const now = () => new Date().toISOString();
  return {
    ...real,
    boardDb: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
    getScan: async (sid: string) => mem.scans.get(sid) ?? null,
    updateScan: async (sid: string, patch: Record<string, unknown>) => { Object.assign(mem.scans.get(sid)!, patch, { updated_at: now() }); },
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
    pinImageState: async (ids: string[]) => Object.fromEntries(ids.filter((i) => mem.pins[i]).map((i) => [i, mem.pins[i]])),
  };
});

import { approveItem, approveReady, processBoardScan } from "./pipeline";
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

const detection = JSON.stringify({ pins: [
  { box: [50, 67, 250, 333], characters: ["Grogu"], keywords: ["Mandalorian"], text: "" },
  { box: [400, 67, 600, 333], characters: ["Remy"], keywords: ["chef"], text: "" },
  { box: [750, 67, 950, 333], characters: ["Woody"], keywords: [], text: "", occluded: true },
  { box: [480, 706, 520, 760], characters: [], keywords: [], text: "" },
] });
const rank = (id: string, conf: number) => JSON.stringify([{ pinId: id, confidence: conf, reasoning: "looks right" }]);

function reply(content: string) {
  return { choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 100 } };
}

async function setup(publicDisplay = true) {
  mem.scans.clear(); mem.items.clear(); mem.objects.clear();
  mem.pixianCalls = 0; mem.published = []; mem.nextId = 1;
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
    // Rank answers in item order; the 4th (tiny) crop gets a weak answer.
    const answers = [rank("PHUK-1", 92), rank("PHUK-2", 90), rank("PHUK-3", 91), rank("PHUK-3", 20)];
    let n = 0;
    mem.create.mockImplementation(async (req: { messages: Array<{ content: unknown }> }) =>
      String(req.messages[0].content).startsWith("You find individual") ? reply(detection) : reply(answers[n++] ?? "[]"));

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
    expect(scan.stats).toMatchObject({ openaiCalls: 5, inputTokens: 5000, pixianCalls: 1 });
    // Nothing published without a reviewer.
    expect(mem.published).toEqual([]);

    // The reviewer publishes the ready pin in one go.
    const result = await approveReady(scan, "admin-1");
    expect(result.approved).toEqual([items[0].id]);
    expect(mem.published).toEqual(["img-PHUK-1"]);
    expect(items[0]).toMatchObject({ image_review: "approved", decision: "confirmed", decided_pin_id: "PHUK-1" });
  });

  it("refuses to publish from a board without public display permission, and never cleans it", async () => {
    await setup(false);
    let n = 0;
    mem.create.mockImplementation(async (req: { messages: Array<{ content: unknown }> }) =>
      String(req.messages[0].content).startsWith("You find individual") ? reply(detection) : reply([rank("PHUK-1", 95)][n++] ?? rank("PHUK-3", 90)));
    await processBoardScan("s1");
    expect(mem.pixianCalls).toBe(0);
    const scan = mem.scans.get("s1") as unknown as BoardScan;
    const item = [...mem.items.values()][0] as unknown as BoardScanItem;
    await expect(approveItem(scan, { ...item, cleanup_status: "done", cleaned_path: "x.jpg" }, "admin-1"))
      .rejects.toThrow(/public display/);
  });

  it("keeps going when one pin fails to match, and resumes only the failed pin", async () => {
    let n = 0;
    mem.create.mockImplementation(async (req: { messages: Array<{ content: unknown }> }) => {
      if (String(req.messages[0].content).startsWith("You find individual")) return reply(detection);
      n++;
      if (n === 2) throw new Error("upstream 500");
      return reply(rank("PHUK-3", 50));
    });
    await processBoardScan("s1");
    expect(mem.scans.get("s1")!.status).toBe("partial");
    const failed = [...mem.items.values()].filter((i) => i.match_status === "failed");
    expect(failed).toHaveLength(1);

    const callsBefore = mem.create.mock.calls.length;
    await processBoardScan("s1");
    expect(mem.scans.get("s1")!.status).toBe("ready");
    // No new detection, one new match call.
    expect(mem.create.mock.calls.length - callsBefore).toBe(1);
  });

  it("marks the board failed when detection itself fails", async () => {
    mem.create.mockRejectedValue(new Error("model unavailable"));
    await processBoardScan("s1");
    expect(mem.scans.get("s1")).toMatchObject({ status: "failed", error: "model unavailable" });
  });
});
