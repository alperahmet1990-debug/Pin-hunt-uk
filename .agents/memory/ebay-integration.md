---
name: eBay integration quirks
description: eBay OAuth/keyset gotchas hit while building the valuation feature and deletion compliance endpoint.
---

- **Production keyset is disabled until eBay's Marketplace Account Deletion verification passes.** Token requests return 401 `invalid_client` until the deletion endpoint (public HTTPS, challenge = SHA-256(challengeCode + verificationToken + exactPortalURL)) is verified. The URL entered in the portal must byte-match what the server hashes — we pin it via `EBAY_DELETION_ENDPOINT_URL`.
- **Credential confusion is common:** `EBAY_CLIENT_ID` = App ID (starts with the username, e.g. `name-App-PRD-...`); `EBAY_CLIENT_SECRET` = Cert ID (starts `PRD-`). User once pasted the Cert ID into both — detectable safely by comparing the two env vars for equality without printing them.
- **Why:** these two failure modes both surface as identical 401s from the token endpoint; check keyset activation and value-equality first before suspecting code.
- Testing authed API routes without a real login: create a temp Supabase user with the service-role admin API, signInWithPassword for a token, delete the user after. Script must run from a dir with `@supabase/supabase-js` resolvable (api-server).
