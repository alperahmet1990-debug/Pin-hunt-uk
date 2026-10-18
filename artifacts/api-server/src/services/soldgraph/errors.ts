/**
 * Typed errors for the Soldgraph client. Messages are deliberately generic:
 * they never carry the API key, response bodies or request URLs, so they are
 * safe to log. Callers must still map them to generic client responses.
 */

export class SoldgraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** SOLDGRAPH_ENABLED is not "true" (kill switch off) or no key is configured. No network call was made. */
export class ProviderDisabledError extends SoldgraphError {
  constructor(public readonly reason: "disabled" | "not_configured" = "disabled") {
    super(reason === "disabled" ? "Soldgraph provider is disabled" : "Soldgraph provider is not configured");
  }
}

/** The monthly credit budget does not allow another billable call. No network call was made. */
export class BudgetExceededError extends SoldgraphError {
  constructor(
    public readonly month: string,
    public readonly usedCredits: number | null,
    public readonly limitCredits: number | null,
  ) {
    super("Soldgraph monthly budget reached");
  }
}

/** The provider reports a quota/daily limit. Do not retry before `until`. */
export class ProviderUnavailableError extends SoldgraphError {
  constructor(
    public readonly until: Date,
    public readonly code: string,
  ) {
    super("Soldgraph provider unavailable");
  }
}

/** Non-retryable (or retries exhausted) HTTP/job failure. status 0 = network error or timeout. */
export class SoldgraphHttpError extends SoldgraphError {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    public readonly requestId: string | null,
  ) {
    super(`Soldgraph request failed (status ${status}${code ? `, ${code}` : ""})`);
  }
}

/** The overall search deadline elapsed (for example a job that stayed pending). */
export class SoldgraphTimeoutError extends SoldgraphError {
  constructor() {
    super("Soldgraph search deadline exceeded");
  }
}
