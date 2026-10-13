declare const require: (m: string) => any;
declare const __dirname: string;
// The app tsconfig has no Node types; load Node built-ins untyped.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", "dist", ".expo", "static-build", "__tests__", "scripts"]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean }) => {
    if (SKIP.has(e.name)) return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

// B-P1-01a: the /catalogue route file stays, but nothing may navigate to it.
describe("/catalogue is unlinked", () => {
  const navToCatalogue = /(push|replace|navigate|href|pathname)\W{0,12}['"`]\/catalogue['"`]/;

  it("has no navigation reference to /catalogue", () => {
    const offenders = ["app", "components", "hooks", "context", "lib", "utils"]
      .flatMap((d) => sourceFiles(path.join(root, d)))
      .filter((f) => navToCatalogue.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("opens Browse Entire Catalogue from the Collection + menu", () => {
    const src = fs.readFileSync(path.join(root, "app/(tabs)/collection.tsx"), "utf8");
    expect(src).toContain("router.push('/browse-catalogue')");
  });
});
