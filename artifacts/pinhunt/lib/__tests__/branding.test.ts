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
    return /\.(tsx?|json)$/.test(e.name) ? [p] : [];
  });
}

describe("branding", () => {
  it("has no user-facing 'PinHunt UK' in app source", () => {
    const offenders = sourceFiles(root).filter((f: string) =>
      fs.readFileSync(f, "utf8").includes("PinHunt UK"),
    );
    expect(offenders).toEqual([]);
  });

  // slug must match the linked EAS project (extra.eas.projectId); the scheme
  // drives deep links and stays "pinhunt".
  it("app.json name is PinHunt; slug matches EAS project; scheme unchanged", () => {
    const { expo } = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
    expect(expo.name).toBe("PinHunt");
    expect(expo.slug).toBe("uk-pin-app");
    expect(expo.scheme).toBe("pinhunt");
  });
});
