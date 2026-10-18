/** Test-only loaders for the text fixtures in this folder. */
import { readFileSync } from "node:fs";
import type { CataloguePin } from "@workspace/pin-repository";

const dir = new URL("./", import.meta.url);

export function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, dir), "utf8")) as T;
}

const rawPins = readFixture<Record<string, Partial<CataloguePin>>>("pins.json");

/** A synthetic catalogue record from pins.json, filled out to a CataloguePin. */
export function fixturePin(key: string): CataloguePin {
  const raw = rawPins[key];
  if (!raw || key.startsWith("_")) throw new Error(`Unknown fixture pin: ${key}`);
  return {
    categories: [],
    externalIdentifiers: {},
    status: "active",
    isUserSubmitted: false,
    ...raw,
  } as CataloguePin;
}
