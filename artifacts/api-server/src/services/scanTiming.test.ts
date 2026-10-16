import { describe, expect, it } from "vitest";
import { createStageTimer } from "./scanTiming";

describe("createStageTimer (#349)", () => {
  it("records each stage as the time since the previous mark, plus a total", () => {
    let t = 1000;
    const timer = createStageTimer(() => t);
    t += 1200.4; timer.mark("describe");
    t += 300; timer.mark("candidates");
    t += 2500.6; timer.mark("rank");
    expect(timer.summary()).toEqual({ describe: 1200, candidates: 300, rank: 2501, total: 4001 });
  });
});
