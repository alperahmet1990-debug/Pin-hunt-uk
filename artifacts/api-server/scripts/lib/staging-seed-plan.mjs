/**
 * Staging seed plan — decides which catalogue pins each synthetic test
 * account holds, so the two-account test scenarios start from a known state.
 *
 * Pure: takes the staging catalogue and returns rows. Unit-tested in
 * staging-seed-plan.test.mjs. Nothing here talks to Supabase.
 */

/** Synthetic accounts. Emails use example.com, which can never receive mail. */
export const STAGING_ACCOUNTS = [
  {
    key: "a",
    email: "pinhunt-staging-a@example.com",
    username: "staging_alex",
    displayName: "Alex (staging)",
    town: "Camden",
    county: "Greater London",
    approxLat: 51.54,
    approxLng: -0.14,
    isAdmin: false,
  },
  {
    key: "b",
    email: "pinhunt-staging-b@example.com",
    username: "staging_bea",
    displayName: "Bea (staging)",
    town: "Croydon",
    county: "Greater London",
    approxLat: 51.38,
    approxLng: -0.1,
    isAdmin: false,
  },
  {
    key: "admin",
    email: "pinhunt-staging-admin@example.com",
    username: "staging_admin",
    displayName: "Admin (staging)",
    town: "Reading",
    county: "Berkshire",
    approxLat: 51.45,
    approxLng: -0.97,
    isAdmin: true,
  },
];

export const MIN_PINS = 40;

/**
 * @param {{ id: string, pinhunt_id: string }[]} pins  verified, searchable pins
 * @param {{ id: string, set_name: string, pinIds: string[] }[]} sets
 */
export function planSeed(pins, sets) {
  if (pins.length < MIN_PINS) {
    throw new Error(
      `Staging has ${pins.length} verified, searchable pins; at least ${MIN_PINS} are needed. Import the catalogue first.`,
    );
  }
  const sorted = [...pins].sort((x, y) => x.pinhunt_id.localeCompare(y.pinhunt_id));
  const byId = new Map(sorted.map((p) => [p.id, p]));

  // A set of 4–12 pins that are all in the catalogue: A owns all but the last
  // two, and B has those two for trade (the "complete my set" scenario).
  const set = [...sets]
    .filter((s) => s.pinIds.length >= 4 && s.pinIds.length <= 12 && s.pinIds.every((id) => byId.has(id)))
    .sort((x, y) => x.set_name.localeCompare(y.set_name))[0] ?? null;
  const setPinIds = set ? [...set.pinIds].sort((x, y) => byId.get(x).pinhunt_id.localeCompare(byId.get(y).pinhunt_id)) : [];
  const setOwned = setPinIds.slice(0, -2);
  const setMissing = setPinIds.slice(-2);

  const pool = sorted.filter((p) => !setPinIds.includes(p.id)).map((p) => p.id);
  const take = (n) => pool.splice(0, n);
  const aOwned = take(8);
  const aWanted = take(4);
  const aForTrade = take(3);
  const bOwned = take(6);
  const untouched = take(5); // held by nobody: search and "add to collection" tests

  const rows = [];
  const add = (account, ids, status, quantity = 1) =>
    ids.forEach((pinId) => rows.push({ account, pinId, status, quantity }));

  add("a", aOwned.slice(0, 1), "owned", 2); // duplicate copy (×2 badge)
  add("a", aOwned.slice(1), "owned");
  add("a", setOwned, "owned");
  add("a", aWanted, "wanted");
  add("a", aForTrade, "for_trade");

  add("b", bOwned, "owned");
  add("b", aWanted.slice(0, 3), "for_trade"); // 3 of A's ISO pins
  add("b", aForTrade.slice(0, 2), "wanted"); // 2 of A's For Trade pins
  add("b", setMissing, "for_trade"); // the 2 pins A needs to finish the set

  const pinhuntId = (id) => byId.get(id).pinhunt_id;
  const boards = [
    {
      account: "a",
      id: "board_staging_favourites",
      name: "Staging favourites",
      pinIds: aOwned.slice(0, 4).map(pinhuntId),
    },
  ];

  return {
    rows,
    boards,
    set: set ? { id: set.id, name: set.set_name, owned: setOwned.length, total: setPinIds.length } : null,
    expected: {
      aIsoMatchedByB: 3,
      aForTradeWantedByB: 2,
      untouchedPinhuntIds: untouched.map(pinhuntId),
    },
  };
}
