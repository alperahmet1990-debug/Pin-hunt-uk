import { describe, expect, it } from "vitest";
import {
  PINANDPOP_SOURCE, createPinAndPopClient, normalisePinAndPop, parseCsv, parseEdition, pinhuntIdFor,
  ppIdFromPinhuntId, seriesSlug, toPinRow, toReferenceImageRow, toSetRow,
} from "./pinandpop.mjs";

const apiItem = {
  id: 130501, name: "Alice", series: "Alice In Wonderland Lava Lamp Mystery Series", origin: "Disney Licensed",
  edition: "LE 300", release_year: "2026", cover_image: "https://cdn.example/lg/130501.jpg",
  url: "https://pinandpop.com/pins/130501/alice", series_url: "https://pinandpop.com/series/alice-lava-lamp",
  self: "https://pinandpop.com/api/v1/pins/130501", added_at: "2026-11-10T05:51:27.000000Z",
};

describe("identity", () => {
  it("derives a stable PHUK id in the 10,000,000+ range and back", () => {
    expect(pinhuntIdFor(1)).toBe("PHUK-10000001");
    expect(pinhuntIdFor(130583)).toBe("PHUK-10130583");
    expect(ppIdFromPinhuntId("PHUK-10130583")).toBe(130583);
    expect(ppIdFromPinhuntId("PHUK-00013086")).toBeNull();
  });
  it("rejects ids that would leave the range", () => {
    expect(() => pinhuntIdFor(0)).toThrow();
    expect(() => pinhuntIdFor(10_000_000)).toThrow();
    expect(() => pinhuntIdFor("12a")).toThrow();
  });
});

describe("parseEdition", () => {
  it.each([
    ["OE", "Open Edition", null], ["LR", "Limited Release", null], ["LE", "Limited Edition", null],
    ["LE 300", "Limited Edition", 300], ["LE 1,500", "Limited Edition", 1500], ["", null, null], [null, null, null],
    ["Fantasy", "Fantasy", null],
  ])("%s", (code, type, size) => {
    expect(parseEdition(code)).toEqual({ edition_type: type, limited_edition_size: size });
  });
});

describe("normalise + rows", () => {
  it("maps an API item and a CSV row identically", () => {
    const csvRow = { ...apiItem, added_at: "2026-11-10 05:51:27" };
    delete csvRow.self;
    const a = normalisePinAndPop(apiItem);
    const b = normalisePinAndPop(csvRow);
    expect(a).toEqual(b);
    expect(a.seriesSlug).toBe("alice-lava-lamp");
  });

  it("never puts the licensed cover image on the public pin row", () => {
    const row = toPinRow(normalisePinAndPop(apiItem), "2026-11-11T00:00:00Z");
    expect(row.image_url).toBeNull();
    expect(JSON.stringify(row)).not.toContain("cdn.example");
    expect(row).toMatchObject({
      pinhunt_id: "PHUK-10130501", title: "Alice", collection: "Alice In Wonderland Lava Lamp Mystery Series",
      normalised_series: "pin_and_pop | alice-lava-lamp", edition_type: "Limited Edition", limited_edition_size: 300,
      release_year: 2026, catalogue_source: PINANDPOP_SOURCE, verification_status: "verified", is_searchable: true,
      external_identifiers: { pin_and_pop: "130501" }, source_url: apiItem.url,
    });
  });

  it("stores the cover image only as a private reference image", () => {
    const img = toReferenceImageRow("uuid-1", normalisePinAndPop(apiItem));
    expect(img).toMatchObject({ pin_id: "uuid-1", image_type: "reference", public_display_allowed: false, uploaded_by: null, source: PINANDPOP_SOURCE });
  });

  it("handles a pin with no series, year, edition or origin", () => {
    const r = normalisePinAndPop({ id: "7", name: " Stitch ", series: "", series_url: "", release_year: "", edition: "", origin: "" });
    expect(r).toMatchObject({ id: 7, name: "Stitch", series: null, seriesSlug: null, releaseYear: null });
    const row = toPinRow(r);
    expect(row.collection).toBe("");
    expect(row.normalised_series).toBeNull();
    expect(row.edition_type).toBeNull();
  });

  it("reports unusable rows instead of importing them", () => {
    expect(normalisePinAndPop({ id: "x", name: "A" }).problem).toBe("invalid id");
    expect(normalisePinAndPop({ id: "5", name: "  " }).problem).toBe("missing name");
  });

  it("keys sets by series URL (two P&P sets share a display name)", () => {
    expect(seriesSlug("https://pinandpop.com/series/Foo-Bar/")).toBe("foo-bar");
    const set = toSetRow([normalisePinAndPop(apiItem), normalisePinAndPop({ ...apiItem, id: 3, release_year: "2024" })]);
    expect(set).toMatchObject({ normalised_series: "pin_and_pop | alice-lava-lamp", released_pin_count: 2, release_year: 2024 });
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines in fields", () => {
    const rows = parseCsv('﻿id,name,series\r\n1,"Rapunzel (SUPER CHASER)","A, B"\n2,"Say ""hi""","line\nbreak"\n');
    expect(rows).toEqual([
      { id: "1", name: "Rapunzel (SUPER CHASER)", series: "A, B" },
      { id: "2", name: 'Say "hi"', series: "line\nbreak" },
    ]);
  });
});

describe("API client", () => {
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, headers: new Headers() });
  const fail = (status, headers = {}) => ({ ok: false, status, text: async () => "nope", headers: new Headers(headers) });

  function harness(responses) {
    const calls = [];
    const sleeps = [];
    let t = 0;
    const client = createPinAndPopClient({
      token: "secret-token",
      fetchImpl: async (url, init) => { calls.push({ url, auth: init.headers.Authorization }); return responses.shift(); },
      sleep: async (ms) => { sleeps.push(ms); t += ms; },
      now: () => t,
    });
    return { client, calls, sleeps };
  }

  it("sends the bearer token and follows next_cursor until it's null", async () => {
    const { client, calls } = harness([
      ok({ data: [{ id: 1 }], meta: { next_cursor: "c2" } }),
      ok({ data: [{ id: 2 }], meta: { next_cursor: null } }),
    ]);
    const pages = [];
    for await (const p of client.pages({ idAfter: 0, perPage: 200 })) pages.push(p);
    expect(pages.map((p) => p.items[0].id)).toEqual([1, 2]);
    expect(calls[0].url).toBe("https://pinandpop.com/api/v1/pins?per_page=200&id_after=0");
    expect(calls[1].url).toContain("cursor=c2");
    expect(calls.every((c) => c.auth === "Bearer secret-token")).toBe(true);
  });

  it("keeps to one request a second", async () => {
    const { client, sleeps } = harness([ok({ data: [] }), ok({ data: [] }), ok({ data: [] })]);
    await client.getJson("/pins"); await client.getJson("/pins"); await client.getJson("/pins");
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("waits Retry-After on 429 and backs off on 5xx, then succeeds", async () => {
    const { client, sleeps } = harness([fail(429, { "retry-after": "7" }), fail(503), ok({ data: [{ id: 9 }] })]);
    const body = await client.getJson("/pins");
    expect(body.data[0].id).toBe(9);
    expect(sleeps).toContain(7000);
    expect(client.requestCount).toBe(3);
  });

  it("does not retry a bad token", async () => {
    const { client, calls } = harness([fail(401)]);
    await expect(client.getJson("/pins")).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it("gives up after maxRetries", async () => {
    const { client } = harness(Array.from({ length: 6 }, () => fail(500)));
    await expect(client.getJson("/pins")).rejects.toMatchObject({ status: 500 });
  });

  it("refuses to start without a token", () => {
    expect(() => createPinAndPopClient({ token: "" })).toThrow(/PINANDPOP_API_TOKEN/);
  });
});
