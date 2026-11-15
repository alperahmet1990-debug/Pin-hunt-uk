// Catalogue gap report: terminal-side loading. The comparison itself is in
// core.mjs, shared with the browser page (compare.html).
import fs from "node:fs";
import path from "node:path";
import { sideFromFiles } from "./core.mjs";

export * from "./core.mjs";

/** Reads one project's export folder (staging/ or production/). */
export function loadSide(dir) {
  if (!fs.existsSync(dir)) throw new Error(`${dir} doesn't exist.`);
  const files = {};
  for (const f of fs.readdirSync(dir)) if (/\.(csv|json|txt)$/.test(f)) files[f] = fs.readFileSync(path.join(dir, f), "utf8");
  return sideFromFiles(files, dir);
}
