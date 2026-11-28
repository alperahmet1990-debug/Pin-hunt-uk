import { describe, it, expect } from "vitest";
import { describeTokenRejection } from "./tokenDiagnostics";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: object, header: object = { alg: "ES256", typ: "JWT" }) =>
  `${b64(header)}.${b64(payload)}.signature-not-checked`;

const NOW = 1_800_000_000;
const PROD_HOST = "prodref.example.test";
const STAGING_HOST = "stagingref.example.test";
const PROD = { SUPABASE_URL: `https://${PROD_HOST}`, SUPABASE_ANON_KEY: "sb_publishable_abc" };

describe("describeTokenRejection", () => {
  it("spots a token from a different Supabase project", () => {
    const token = jwt({ iss: `https://${STAGING_HOST}/auth/v1`, exp: NOW + 600, role: "authenticated" });
    const d = describeTokenRejection(token, { message: "invalid JWT", status: 403 }, PROD, NOW);
    expect(d.serverProject).toBe(PROD_HOST);
    expect(d.tokenProject).toBe(STAGING_HOST);
    expect(d.projectMatches).toBe(false);
    expect(d.tokenExpired).toBe(false);
    expect(d.supabaseError).toBe("invalid JWT");
    expect(d.supabaseStatus).toBe(403);
    expect(d.tokenAlg).toBe("ES256");
    expect(d.tokenRole).toBe("authenticated");
  });

  it("spots an expired token from the right project", () => {
    const token = jwt({ iss: `https://${PROD_HOST}/auth/v1`, exp: NOW - 120, role: "authenticated" });
    const d = describeTokenRejection(token, { message: "token is expired" }, PROD, NOW);
    expect(d.projectMatches).toBe(true);
    expect(d.tokenExpired).toBe(true);
    expect(d.tokenExpirySecondsAgo).toBe(120);
  });

  it("reports the server's key kind without its value", () => {
    const token = jwt({ iss: `https://${PROD_HOST}/auth/v1`, exp: NOW + 1 });
    expect(describeTokenRejection(token, null, { ...PROD, SUPABASE_ANON_KEY: "eyJlegacy" }, NOW).serverKeyKind).toBe("legacy_jwt");
    expect(describeTokenRejection(token, null, { ...PROD, SUPABASE_ANON_KEY: " " }, NOW).serverKeyKind).toBe("missing");
    expect(describeTokenRejection(token, null, { ...PROD, SUPABASE_ANON_KEY: "something" }, NOW).serverKeyKind).toBe("other");
    expect(describeTokenRejection(token, null, PROD, NOW).serverKeyKind).toBe("publishable");
  });

  it("ignores stray spaces around SUPABASE_URL", () => {
    const token = jwt({ iss: `https://${PROD_HOST}/auth/v1`, exp: NOW + 1 });
    const d = describeTokenRejection(token, null, { ...PROD, SUPABASE_URL: ` https://${PROD_HOST}/ \n` }, NOW);
    expect(d.projectMatches).toBe(true);
  });

  it("never includes the token, key, email or user id in its output", () => {
    const token = jwt({ iss: `https://${PROD_HOST}/auth/v1`, exp: NOW, email: "someone@example.com", sub: "user-id-123" });
    const out = JSON.stringify(describeTokenRejection(token, { message: "x" }, PROD, NOW));
    expect(out).not.toContain(token);
    expect(out).not.toContain("signature-not-checked");
    expect(out).not.toContain("sb_publishable_abc");
    expect(out).not.toContain("someone@example.com");
    expect(out).not.toContain("user-id-123");
  });

  it("copes with a token that isn't a JWT and a missing SUPABASE_URL", () => {
    const d = describeTokenRejection("not-a-jwt", undefined, {}, NOW);
    expect(d.tokenUnreadable).toBe(true);
    expect(d.serverProject).toBeNull();
    expect(d.projectMatches).toBeNull();
    expect(d.serverKeyKind).toBe("missing");
  });
});

import { describeAdminRefusal, describeServiceKey } from "./tokenDiagnostics";

describe("describeAdminRefusal", () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwtKey = (role: string) => `${b64({ alg: "HS256" })}.${b64({ role })}.sig`;

  it("tells the key kinds apart without their values", () => {
    expect(describeServiceKey("sb_secret_abc")).toBe("secret");
    expect(describeServiceKey("sb_publishable_abc")).toBe("publishable");
    expect(describeServiceKey(jwtKey("service_role"))).toBe("service_role_jwt");
    expect(describeServiceKey(jwtKey("anon"))).toBe("anon_jwt");
    expect(describeServiceKey(undefined)).toBe("missing");
  });

  it("says whether the profile was found, what it says and which project was read; never the key", () => {
    const env = { SUPABASE_URL: "https://prodref.example.test", SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_secretvalue" };
    const d = describeAdminRefusal(null, { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, env);
    expect(d).toEqual({
      profileFound: false, isAdmin: null, dbError: "JSON object requested, multiple (or no) rows returned", dbCode: "PGRST116",
      serverProject: "prodref.example.test", serviceKeyKind: "publishable",
    });
    expect(JSON.stringify(d)).not.toContain("secretvalue");
    expect(describeAdminRefusal({ is_admin: false }, null, env)).toMatchObject({ profileFound: true, isAdmin: false });
  });
});
