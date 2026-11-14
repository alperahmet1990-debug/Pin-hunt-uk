// Tests artifacts/api-server/scripts/ctp-photo-match.mjs with fake Supabase
// and OpenAI responses: no network, no keys.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main, parseAnswer, pickSample, buildRequest } from "../../artifacts/api-server/scripts/ctp-photo-match.mjs";

const STAGING = "ssssssssssssssssssss";
const PROD = "pppppppppppppppppppp";
const env = {
  PINHUNT_ENV: "staging", STAGING_PROJECT_REF: STAGING, PRODUCTION_PROJECT_REF: PROD,
  SUPABASE_URL: `https://${STAGING}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: "service-key-for-test", OPENAI_API_KEY: "test-key",
};
const q = (o) => `"${JSON.stringify(o).replace(/"/g, '""')}"`;

function files(dir) {
  const estimate = [
    { ctp_pin: "PHUK-00000001", tier: "strong (one candidate, same year)", best_pin: "PHUK-10000001", second_pin: null, fuzzy_candidates: null },
    { ctp_pin: "PHUK-00000002", tier: "ambiguous (several close candidates)", best_pin: "PHUK-10000002", second_pin: "PHUK-10000003", fuzzy_candidates: null },
    { ctp_pin: "PHUK-00000003", tier: "none", best_pin: null, second_pin: null, fuzzy_candidates: null },
  ];
  const estPath = path.join(dir, "estimate.csv");
  fs.writeFileSync(estPath, `part,chunk,payload\nsummary,0,"{}"\nrows,1,${q(estimate)}\n`);
  const pins = [1, 2, 3].map((n) => ({ pinhunt_id: `PHUK-0000000${n}`, id: `c${n}`, title: `Series - Pin ${n}`, collection: "Series", release_year: "2010", edition_type: "Limited Edition", image_url: `https://${PROD}.supabase.co/storage/v1/object/public/pin-catalogue/collectible-pintrader/${n}.jpg`, content_md5: "m", content: "{}" }));
  const prodPath = path.join(dir, "production.csv");
  fs.writeFileSync(prodPath, ["part,chunk,items,payload", `summary,1,1,${q({ environment: "production", pins: { total: 3 }, pin_images: [] })}`, `pins,1,3,${q(pins)}`, `images,1,0,${q([])}`].join("\n") + "\n");
  return { estPath, prodPath };
}

function fakeFetch(log) {
  const pins = { "PHUK-10000001": "u1", "PHUK-10000002": "u2", "PHUK-10000003": "u3" };
  return async (url, opts = {}) => {
    log.push({ url: String(url), method: opts.method ?? "GET", body: opts.body ?? null });
    const u = String(url);
    if (u.includes(".supabase.co/rest/v1/pins?") && u.includes("title=ilike.")) return { ok: true, status: 200, json: async () => [] };
    if (u.includes(".supabase.co/rest/v1/pins?")) {
      return { ok: true, status: 200, json: async () => Object.entries(pins).filter(([phid]) => decodeURIComponent(u).includes(phid)).map(([phid, id]) => ({ id, pinhunt_id: phid, title: "Pin", collection: "Series", release_year: 2010, edition_type: "Limited Edition", limited_edition_size: null })) };
    }
    if (u.includes(".supabase.co/rest/v1/pin_images?")) {
      return { ok: true, status: 200, json: async () => ["u1", "u2", "u3"].filter((id) => decodeURIComponent(u).includes(id)).map((id) => ({ pin_id: id, image_url: `https://cdn.pinandpop.example/${id}.jpg` })) };
    }
    if (u.includes("openai.com")) {
      const req = JSON.parse(opts.body);
      const first = req.messages[0].content.match(/1\. (PHUK-\d+)/)[1];
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: `{"match":"${first}","confidence":91,"reasoning":"same design"}` } }], usage: { prompt_tokens: 1000, completion_tokens: 50 } }) };
    }
    throw new Error(`unexpected request ${u}`);
  };
}

test("dry run reads staging only and makes no AI calls", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctp-"));
  const { estPath, prodPath } = files(dir);
  const calls = [];
  const out = await main(["--estimate", estPath, "--production", prodPath, "--out", path.join(dir, "out")], env, fakeFetch(calls), () => {});
  assert.equal(out.items.length, 2, "the 'none' photo has no candidates to compare and isn't sampled");
  assert.ok(calls.every((c) => c.method === "GET" && c.url.includes(".supabase.co/rest/v1/")), "only read requests to staging");
  assert.ok(!fs.existsSync(path.join(dir, "out")), "dry run writes nothing");
});

test("--run compares with Pin & Pop images, writes the outputs, and never writes to Supabase", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctp-"));
  const { estPath, prodPath } = files(dir);
  const calls = [];
  const { results, share } = await main(["--estimate", estPath, "--production", prodPath, "--out", path.join(dir, "out"), "--run"], env, fakeFetch(calls), () => {});
  const supa = calls.filter((c) => c.url.includes(".supabase.co"));
  assert.ok(supa.every((c) => c.method === "GET"), "Supabase is only read");
  const ai = calls.filter((c) => c.url.includes("openai.com"));
  assert.equal(ai.length, 2);
  assert.match(ai[0].body, /cdn\.pinandpop\.example/, "Pin & Pop reference images are sent for comparison (maintainer decision, 14 Nov)");
  assert.match(ai[0].body, /collectible-pintrader\/\d\.jpg/);
  assert.equal(results[0].ai.match, "PHUK-10000001");
  assert.equal(share.tokens.prompt, 2000);
  for (const f of ["results.json", "results.csv", "review.html", "share.json"]) assert.ok(fs.existsSync(path.join(dir, "out", f)), f);
  const shareText = fs.readFileSync(path.join(dir, "out", "share.json"), "utf8");
  assert.ok(!/pinandpop|Pin \d/.test(shareText), "share.json carries no Pin & Pop links or titles");
});

test("an empty model line in the settings file falls back to the default model, and failures are reported", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ctp-"));
  const { estPath, prodPath } = files(dir);
  const calls = [];
  const base = fakeFetch(calls);
  const logs = [];
  const fetchImpl = async (url, opts) => {
    if (String(url).includes("openai.com")) {
      const model = JSON.parse(opts.body).model;
      if (!model) return { ok: false, status: 400, json: async () => ({ error: { message: "you must provide a model parameter" } }) };
    }
    return base(url, opts);
  };
  const { share } = await main(["--estimate", estPath, "--production", prodPath, "--out", path.join(dir, "out"), "--run"],
    { ...env, OPENAI_SCAN_MODEL: "", OPENAI_BULK_MATCH_MODEL: "  " }, fetchImpl, (m) => logs.push(m));
  assert.equal(share.model, "gpt-5.6-luna");
  assert.equal(share.ai_outcome.error ?? 0, 0);
  const failing = async (url, opts) => (String(url).includes("openai.com") ? { ok: false, status: 401, json: async () => ({ error: { message: "Incorrect API key provided" } }) } : base(url, opts));
  await main(["--estimate", estPath, "--production", prodPath, "--out", path.join(dir, "out2"), "--run"], env, failing, (m) => logs.push(m));
  assert.ok(logs.some((m) => /2 of 2 AI calls failed\. First error: OpenAI error 401/.test(m)));
});

test("refuses a production target", async () => {
  await assert.rejects(() => main(["--estimate", "x", "--production", "y", "--out", "z"], { ...env, SUPABASE_URL: `https://${PROD}.supabase.co` }, async () => { throw new Error("no network"); }, () => {}), /STAGING_PROJECT_REF|production/);
});

test("answers outside the candidate list are rejected", () => {
  const item = { candidates: [{ pinhuntId: "PHUK-10000001" }] };
  assert.equal(parseAnswer('{"match":"PHUK-99","confidence":90}', item).match, null);
  assert.equal(parseAnswer('noise {"match":"PHUK-10000001","confidence":88,"reasoning":"x"}', item).match, "PHUK-10000001");
  assert.equal(parseAnswer("no json", item).invalid, true);
});

test("sample is spread across tiers and deterministic", () => {
  const tiers = ["strong (x)", "likely (x)", "ambiguous (x)", "weak (x)", "fuzzy only", "conflict (x)", "possible (x)"];
  const est = Array.from({ length: 700 }, (_, i) => ({ ctp_pin: `PHUK-${String(i).padStart(8, "0")}`, tier: tiers[i % 7], best_pin: "PHUK-10000001" }));
  const photos = new Map(est.map((r) => [r.ctp_pin, { title: "t" }]));
  const a = pickSample(est, photos, 50), b = pickSample(est, photos, 50);
  assert.equal(a.length, 50);
  assert.deepEqual(a.map((r) => r.ctp_pin), b.map((r) => r.ctp_pin));
  assert.equal(a.filter((r) => r.tier.startsWith("strong")).length, 10);
});

test("request asks for JSON and uses the scan's 2048-token floor", () => {
  const req = buildRequest({ ctp: { title: "A", imageUrl: "https://x/a.jpg" }, candidates: [{ pinhuntId: "PHUK-10000001", title: "B", imageUrl: "https://y/b.jpg" }] }, { model: "m", effort: "low" });
  assert.equal(req.max_completion_tokens, 2048);
  assert.equal(req.reasoning_effort, "low");
  assert.equal(req.messages[1].content.filter((c) => c.type === "image_url").length, 2);
});
