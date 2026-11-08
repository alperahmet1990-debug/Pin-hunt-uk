import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isReasoningEffortRejected,
  resetScanReasoningForTests,
  scanReasoningEffort,
  withScanReasoning,
} from "./scanReasoning";

describe("scan reasoning effort", () => {
  const saved = process.env.OPENAI_SCAN_REASONING_EFFORT;
  beforeEach(() => {
    resetScanReasoningForTests();
    delete process.env.OPENAI_SCAN_REASONING_EFFORT;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.OPENAI_SCAN_REASONING_EFFORT;
    else process.env.OPENAI_SCAN_REASONING_EFFORT = saved;
  });

  it("defaults to low, can be set, switched off, and ignores nonsense", () => {
    expect(scanReasoningEffort({})).toBe("low");
    expect(scanReasoningEffort({ OPENAI_SCAN_REASONING_EFFORT: "Minimal" })).toBe("minimal");
    expect(scanReasoningEffort({ OPENAI_SCAN_REASONING_EFFORT: "off" })).toBeNull();
    expect(scanReasoningEffort({ OPENAI_SCAN_REASONING_EFFORT: "turbo" })).toBe("low");
  });

  it("adds the effort to the call", async () => {
    const call = vi.fn(async (extra: object) => extra);
    await expect(withScanReasoning(call)).resolves.toEqual({ reasoning_effort: "low" });
  });

  it("sends nothing when switched off", async () => {
    process.env.OPENAI_SCAN_REASONING_EFFORT = "off";
    const call = vi.fn(async (extra: object) => extra);
    await expect(withScanReasoning(call)).resolves.toEqual({});
  });

  it("a model that rejects the option: retried once without it, and not sent again", async () => {
    const rejection = Object.assign(new Error("Unsupported parameter: 'reasoning_effort'"), { status: 400, param: "reasoning_effort" });
    const call = vi.fn(async (extra: { reasoning_effort?: string }) => {
      if (extra.reasoning_effort) throw rejection;
      return "ok";
    });
    await expect(withScanReasoning(call)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
    await withScanReasoning(call);
    expect(call).toHaveBeenCalledTimes(3);
    expect(call.mock.calls[2][0]).toEqual({});
  });

  it("other errors are passed on, not retried", async () => {
    const call = vi.fn(async () => { throw Object.assign(new Error("boom"), { status: 500 }); });
    await expect(withScanReasoning(call)).rejects.toThrow("boom");
    expect(call).toHaveBeenCalledTimes(1);
    expect(isReasoningEffortRejected({ status: 400, message: "bad image" })).toBe(false);
  });
});
