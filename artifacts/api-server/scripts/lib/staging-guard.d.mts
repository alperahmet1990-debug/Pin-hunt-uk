// Types for staging-guard.mjs, so the TypeScript scripts in /scripts can import it.
export declare const STAGING_MARKER_BUCKET: string;
export declare function requireStaging(
  env?: Record<string, string | undefined>,
  opts?: { createClient?: unknown; exit?: (code: number) => void },
): Promise<{ ref: string; url: string }>;
