# TestFlight feedback → GitHub issues

Every 15 minutes a GitHub Actions job reads new TestFlight feedback for PinHunt
(App Store Connect app `6823062114`) and files each item as a GitHub issue for
triage. It only reads from Apple and only creates issues.

| Piece | Where |
|---|---|
| Script (no dependencies) | `scripts/testflight-feedback/run.mjs`, helpers in `lib.mjs` |
| Tests | `scripts/testflight-feedback/*.test.mjs` (run by `pnpm test`) |
| Workflow (proposed) | `docs/release/proposed/testflight-feedback.yml` |

## What gets filed

- **Screenshot feedback** (sent from the app or the TestFlight app) and **crash
  reports**, newest 150 of each per run, oldest filed first.
- One issue per item, labelled `testflight-feedback` and `agent-proposed`. As
  with any proposal, nothing is started until the maintainer adds `approved`.
- Contents: the tester's comment, build number, date, device model, iOS version,
  number of screenshots, and for crashes a short summary (exception type,
  codes, termination reason, crashed thread). Plus the feedback ID and a link
  to TestFlight in App Store Connect.
- At most 10 issues per run; the rest follow on the next run.
- Never twice: each issue carries a hidden `testflight-feedback:<kind>:<id>`
  marker, and the job skips any ID already filed (open or closed). Closing or
  relabelling an issue is safe; deleting the marker from its body is not.

## Privacy (this repository is public)

- Tester names and emails are never requested from Apple.
- Screenshots are counted, not linked: their URLs are not published.
- Crash logs are reduced to the header fields above; device identifiers and
  stack traces stay in App Store Connect.
- Email addresses and phone numbers typed into comments are replaced with
  `[email removed]` / `[number removed]`; @mentions are defused.
- Testers can still type other personal details into a comment. Edit or delete
  such an issue if that happens.

## One-time setup (maintainer, about 15 minutes)

1. **App Store Connect API key, separate from the one EAS uses.**
   App Store Connect → Users and Access → Integrations → App Store Connect API
   → Team Keys → **+**. Name it `github-testflight-feedback`.
   - Role: start with **Developer**. If the first run fails with "role cannot
     read TestFlight feedback", revoke it and create one with **App Manager**.
   - Download the `.p8` file (only offered once) and note the **Key ID** and
     the **Issuer ID** shown above the key list.
2. **GitHub environment.** Repo Settings → Environments → **New environment**
   `testflight-feedback` → Deployment branches: **Selected branches** → `main`.
   Add three environment secrets:
   - `ASC_KEY_ID`: the Key ID
   - `ASC_ISSUER_ID`: the Issuer ID
   - `ASC_PRIVATE_KEY`: the full contents of the `.p8` file, including the
     `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
3. **Activate the workflow.** Create `.github/workflows/testflight-feedback.yml`
   with the contents of `docs/release/proposed/testflight-feedback.yml`, in a
   PR labelled `human-approved-config`, and merge it.
4. **First run.** Actions → **TestFlight feedback** → Run workflow with
   **dry run** ticked. Check the log shows what it would file, then run it
   again without dry run. After that it runs by itself every 15 minutes.

The job creates the `testflight-feedback` label on its first real run.

## Timing

Scheduled runs are every 15 minutes, so new feedback normally becomes an issue
within 15–30 minutes (GitHub can start scheduled runs a few minutes late). Each
run takes about 20 seconds; Actions minutes are free on public repositories.
For an immediate check, use **Run workflow**. Instant delivery is possible later
via App Store Connect webhooks (`BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED`,
`BETA_FEEDBACK_CRASH_SUBMISSION_CREATED`) calling a `repository_dispatch`, but
needs an always-on receiver.

GitHub pauses scheduled workflows after 60 days without repository activity;
re-enable it from the Actions tab if that happens.

## Turning it off

Actions → TestFlight feedback → ⋯ → **Disable workflow**. To revoke access
entirely, also delete the API key in App Store Connect.
