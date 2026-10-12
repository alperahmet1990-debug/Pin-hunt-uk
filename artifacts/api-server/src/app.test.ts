import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "./app";

describe("GET /api/healthz", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

// Regression for the launch audit's unauthenticated-access check (Report 3):
// every protected route must reject a request with no Bearer token before
// doing any work.
describe("protected routes without a token", () => {
  const protectedRoutes: Array<["get" | "post" | "patch", string]> = [
    ["post", "/api/scan/identify"],
    ["post", "/api/pins/PHUK-00000001/market-value/refresh"],
    ["post", "/api/pin-images/contribute/preview"],
    ["post", "/api/pin-images/contribute"],
    ["post", "/api/pin-submissions/preview"],
    ["post", "/api/pin-submissions"],
    ["post", "/api/admin/seed-pins"],
    ["get", "/api/admin/catalogue-status"],
    ["get", "/api/admin/pins/missing-images"],
    ["patch", "/api/admin/pins/PHUK-00000001/images"],
  ];

  it.each(protectedRoutes)("%s %s → 401", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await request(app)
      .post("/api/scan/identify")
      .set("Authorization", "Token abc")
      .send({});
    expect(res.status).toBe(401);
  });
});
