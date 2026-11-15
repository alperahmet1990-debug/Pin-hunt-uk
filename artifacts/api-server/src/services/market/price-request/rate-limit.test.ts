import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit per key in a rolling window", () => {
    let now = 0;
    const rl = createRateLimiter(2, 60_000, () => now);
    expect(rl.take("a")).toBe(true);
    expect(rl.take("a")).toBe(true);
    expect(rl.take("a")).toBe(false);
    expect(rl.take("b")).toBe(true);
    now = 60_001;
    expect(rl.take("a")).toBe(true);
  });
});
