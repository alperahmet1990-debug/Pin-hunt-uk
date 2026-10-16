/**
 * Per-stage timings for one scan (#349), logged as a single line so slow
 * scans can be traced to a stage in the server logs. Durations only: no
 * photo, user or catalogue data.
 */
export function createStageTimer(now: () => number = () => performance.now()) {
  const start = now();
  let last = start;
  const stages: Record<string, number> = {};
  return {
    /** Record the time since the previous mark (or the start) under `stage`. */
    mark(stage: string) {
      const t = now();
      stages[stage] = Math.round(t - last);
      last = t;
    },
    /** Stage durations in ms, plus the total since the timer started. */
    summary(): Record<string, number> {
      return { ...stages, total: Math.round(now() - start) };
    },
  };
}
