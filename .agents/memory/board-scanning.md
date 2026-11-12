---
name: Bulk board scanning
description: Board photo → per-pin crops → catalogue match → Pixian → reviewed publish. Shared pipeline for admin capture (Step A) and future collector scanning (Step B).
---
- Code: `artifacts/api-server/src/services/boardScan/` (detect, quality, match, rules, pipeline, store), routes `routes/board-scans.ts`, admin screens `app/admin/board-scans.tsx` + `app/admin/board-scan/[id].tsx`. Runbook: `artifacts/api-server/scripts/BOARD-SCANNING.md`. Migration 078 (staging first).
- Recognition is shared with `/scan/identify`: prompts live in `services/pinRank.ts`. Change them there, not by copying — both experiences must stay one recognition system.
- Detection, matching and clean-up are separate steps on purpose; detection's per-pin description replaces the per-crop "describe" call.
- Rights: every board stores a permission record; no public-display permission ⇒ never cleaned or published. Pin & Pop images are recognition-only references via the shared `services/scanReferenceImages.ts` (sent to the model, never returned/stored/published). Branch includes the Pin & Pop staging work; migration is 078 (P&P owns 075–077).
- Nothing publishes without a reviewer action; "approve all ready" only takes cleaned, confident/confirmed crops of pins with no photo.
- Step B (collectors) should add mode='collector' rows + own-row RLS and reuse the same pipeline minus Pixian/publish.
