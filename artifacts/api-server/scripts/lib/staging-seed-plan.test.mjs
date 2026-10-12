import { describe, expect, it } from "vitest";
import { MIN_PINS, planSeed } from "./staging-seed-plan.mjs";

const pins = Array.from({ length: 60 }, (_, i) => ({
  id: `uuid-${i}`,
  pinhunt_id: `PHUK-${String(i).padStart(8, "0")}`,
}));
const sets = [
  { id: "set-big", set_name: "A big set", pinIds: pins.slice(0, 20).map((p) => p.id) },
  { id: "set-ok", set_name: "B set", pinIds: pins.slice(50, 56).map((p) => p.id) },
];

const statusOf = (rows, account, status) => rows.filter((r) => r.account === account && r.status === status).map((r) => r.pinId);

describe("planSeed", () => {
  it("refuses a catalogue that is too small", () => {
    expect(() => planSeed(pins.slice(0, MIN_PINS - 1), [])).toThrow(/Import the catalogue/);
  });

  it("engineers two-way trade matches between A and B", () => {
    const { rows, expected } = planSeed(pins, sets);
    const aWanted = statusOf(rows, "a", "wanted");
    const aForTrade = statusOf(rows, "a", "for_trade");
    const bForTrade = statusOf(rows, "b", "for_trade");
    const bWanted = statusOf(rows, "b", "wanted");
    expect(aWanted.filter((id) => bForTrade.includes(id))).toHaveLength(expected.aIsoMatchedByB);
    expect(aForTrade.filter((id) => bWanted.includes(id))).toHaveLength(expected.aForTradeWantedByB);
  });

  it("leaves A two pins short of a 4–12 pin set, with B holding both for trade", () => {
    const { rows, set } = planSeed(pins, sets);
    expect(set).toEqual({ id: "set-ok", name: "B set", owned: 4, total: 6 });
    const missing = pins.slice(54, 56).map((p) => p.id);
    expect(statusOf(rows, "b", "for_trade")).toEqual(expect.arrayContaining(missing));
    expect(rows.some((r) => r.account === "a" && missing.includes(r.pinId))).toBe(false);
  });

  it("gives each account at most one row per pin and one duplicate copy", () => {
    const { rows } = planSeed(pins, sets);
    for (const acct of ["a", "b"]) {
      const ids = rows.filter((r) => r.account === acct).map((r) => r.pinId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(rows.filter((r) => r.quantity > 1)).toEqual([expect.objectContaining({ account: "a", status: "owned", quantity: 2 })]);
  });

  it("keeps some pins untouched and boards use pinhunt_ids", () => {
    const { rows, boards, expected } = planSeed(pins, sets);
    const held = new Set(rows.map((r) => r.pinId));
    expect(expected.untouchedPinhuntIds).toHaveLength(5);
    for (const phid of expected.untouchedPinhuntIds) {
      expect(held.has(pins.find((p) => p.pinhunt_id === phid).id)).toBe(false);
    }
    expect(boards[0].pinIds.every((id) => id.startsWith("PHUK-"))).toBe(true);
  });

  it("works when no set fits", () => {
    expect(planSeed(pins, []).set).toBeNull();
  });
});
