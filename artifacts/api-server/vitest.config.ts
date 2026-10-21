import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
    // Tests must never reach Supabase or a paid API: point every external
    // credential at nothing so an accidental call fails fast instead.
    env: {
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "",
      OPENAI_API_KEY: "",
      PIXIAN_API_ID: "",
      PIXIAN_API_SECRET: "",
      EBAY_CLIENT_ID: "",
      EBAY_CLIENT_SECRET: "",
      GOOGLE_APPLICATION_CREDENTIALS_JSON: "",
      SOLDGRAPH_API_KEY: "",
      SOLDGRAPH_ENABLED: "",
      MARKET_VALUATION_V2_ENABLED: "",
      MARKET_VALUATION_PUBLISHED_MARKETS: "",
      MARKET_COMPS_PUBLIC_ENABLED: "",
      LOG_LEVEL: "silent",
    },
  },
});
