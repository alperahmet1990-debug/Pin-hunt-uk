# Research Review: hosted preview

One fixed link that opens the Research Review screen (Catalogue tab) on a Mac, iPad or any browser, with the
current backfill research loaded. No terminal, no accounts, no Supabase.

## What the preview is

- The real admin screen (`app/admin/research-review.tsx`), exported for web by
  `artifacts/pinhunt/scripts/build-research-preview.mjs`.
- Demo mode with Supabase left empty. Static preview mode (`EXPO_PUBLIC_RESEARCH_PREVIEW=static`) can only switch
  on in demo admin mode, and demo mode refuses to activate when Supabase is configured.
- The Research Review API is answered in the browser (`lib/researchPreview`) from the bundled research runs
  (`/research-preview/runs.json`). The page makes no requests to any other site.
- Decisions (Validate, Research needed, Reject, Flag issue, spreadsheet checks) are saved in that browser only.
  **Export decisions** downloads them as JSON and **Import decisions** loads them on another device or after
  clearing the browser. **Start over** clears them. The file format is the same as the local preview's
  `~/.pinhunt-research-review-preview.json`.
- **Export research needed** works as before and feeds the hourly research
  (`docs/research/catalogue-backfill/research-needed/`).
- The build refuses to finish if the output contains anything that looks like a Supabase project address, a JWT
  or an API key. Pages carry `noindex` and `robots.txt` disallows crawling.

Anyone with the link can open the preview and read the research data (all of it from public sources). Nobody
can change your decisions: each viewer's decisions stay in their own browser.

## Deploying it (proposed, not active)

The Expo token is held in the `eas-preview` GitHub environment, which only `main` can use, and the existing
workflow is guarded to `main`. So a preview cannot be deployed directly from a PR branch, and it should not
be: that would hand the token to unreviewed code.

`docs/release/proposed/research-review-preview.yml` splits the work instead:

1. **build**: checks out the chosen branch with no secrets, builds the static site and uploads it as a workflow
   artifact.
2. **deploy**: runs main's code in the `eas-preview` environment and only uploads those static files to EAS
   Hosting under the alias `research-review`, so the link stays the same every time.

Any branch can then be previewed (for example an unmerged PR) without merging it.

One-time steps (maintainer):

1. Copy the file to `.github/workflows/research-review-preview.yml` in a PR labelled `human-approved-config`, and
   merge it to `main`.
2. If EAS Hosting has not been used on this project yet, run `npx eas-cli deploy` once on a Mac to choose the
   preview subdomain (EAS asks for it interactively the first time).
3. Run **Actions → Research Review preview (manual) → Run workflow**. The deploy log prints the address, of the
   form `https://<subdomain>--research-review.expo.app/`. Bookmark it on the Mac and the iPad.

Re-run the workflow whenever the research or the screen changes. Your saved decisions are kept, because they are
stored by research key; pins that no longer exist in the new data are skipped and counted on import.

## Building it locally

```
cd artifacts/pinhunt
node scripts/build-research-preview.mjs --runs ../../research/catalogue-engine/out/backfill-runs/run_*.json
npx serve dist-research-preview      # or any static file server
```
