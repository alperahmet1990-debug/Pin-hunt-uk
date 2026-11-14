import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { USER_CONTENT_BUCKETS } from "./account-deletion";

// Raw contributed photos (migration 079) must stay admin-only: a private
// bucket whose only storage policy is an admin SELECT. This reads the
// migration itself; supabase/verify/079_verify.sql checks the live project.

const MIGRATION = readFileSync(
  join(__dirname, "../../../../supabase/migrations/079_contributed_image_raw.sql"),
  "utf8",
);
const sql = MIGRATION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("migration 079: raw contributed photos", () => {
  it("creates the bucket private, and forces it private if it already exists", () => {
    expect(sql).toMatch(/'pin-contributed-raw',\s*'pin-contributed-raw',\s*false,/);
    expect(sql).toMatch(/on conflict \(id\) do update\s+set public = false, file_size_limit = 10485760, allowed_mime_types = array\['image\/jpeg'\]/);
    expect(sql).toMatch(/10485760,\s*array\['image\/jpeg'\]\s*\)/);
  });

  it("has exactly one storage policy for the bucket: admin SELECT", () => {
    const policies = [...sql.matchAll(/create policy "([^"]+)"\s+on storage\.objects\s+for (\w+)\s+using \(([^;]+)\);/g)];
    const forBucket = policies.filter((p) => p[3].includes("pin-contributed-raw"));
    expect(forBucket).toHaveLength(1);
    expect(forBucket[0][2]).toBe("select");
    expect(forBucket[0][3]).toMatch(/public\.is_admin\(\)/);
    expect(forBucket[0][3]).not.toMatch(/auth\.uid\(\)/);
    // No insert/update/delete/all policy anywhere in this migration.
    expect(sql).not.toMatch(/for (insert|update|delete|all)\b/i);
  });

  it("is removed on account deletion (SQL lister and the API's allow-list)", () => {
    expect(sql).toMatch(/'pin-contributed-images', 'pin-contributed-raw'/);
    expect(USER_CONTENT_BUCKETS).toContain("pin-contributed-raw");
  });
});
