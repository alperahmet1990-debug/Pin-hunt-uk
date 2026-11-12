# Board scanning — staging runbook (Step A: admin catalogue image capture)

Turn a photo of a pin trading board into matched, cleaned, approved catalogue photos.

```
upload board ─► detect pins ─► crop + quality ─► match each crop ─► prioritise ─► clean (Pixian) ─► reviewer approves ─► publish
               detect.ts       quality.ts         match.ts            rules.ts      pipeline.ts        app/admin/board-scan    contributed-images.ts
```

All in `artifacts/api-server/src/services/boardScan/`, routes in `src/routes/board-scans.ts`, admin screens `app/admin/board-scans.tsx` and `app/admin/board-scan/[id].tsx` (App Creator section of Admin).

## What it reuses

| Need | Reused |
|---|---|
| Recognition | Same model (`OPENAI_SCAN_MODEL`), catalogue search (`scanCandidates.ts`), ranking + photo-comparison prompts (now shared in `pinRank.ts`, used by `/scan/identify` too), `scanVerify.ts` rules, `scanReasoning.ts` |
| Clean-up | `pixian.ts` (`normalizePinPhoto`, test mode, timeout/retry) |
| Approval + publishing | `pin_images` rows via `createContributedImage`, then `publishContributedImage` (watermark, public bucket, `pins.image_url`) |
| Storage | Cleaned photos in the existing private `pin-contributed-images` bucket; board photos and crops in a new private `board-scans` bucket |

Pin & Pop reference images (migration 042) are shown to the model during matching only — permitted internal recognition. They are never returned to the app, stored as crops or published.

## Setup (staging only)

1. Apply `supabase/migrations/078_board_scans.sql` in the **staging** SQL editor (rollback SQL is in its header).
2. In the staging API server env: `OPENAI_API_KEY` (low-budget staging key), `PIXIAN_API_ID`/`PIXIAN_API_SECRET`, `PIXIAN_TEST_MODE=true` (free, watermarked results — switch off only for a real run).
3. Start the API server for staging, sign in to the app as the App Creator, open **Admin → Board Scans**.

## Permission and rights

Every board records, before anything is processed: whose photo it is (PinHunt's own, or a collector's with their name, handle and where the permission evidence is kept), permission to crop/process (required), permission to display publicly (required to clean or publish), and a declaration that it isn't taken from Pin & Pop or another catalogue. The database enforces the first and last (`board_scans` check constraints). Published photos carry `pin_images.source = 'pinhunt_board_scan'` and `source_record_id = board_scan_items.id`, which traces back to the board's permission record.

Uploaded photos are re-encoded, which strips EXIF (including GPS location).

## Cost controls

| Control | Default | Env |
|---|---|---|
| Pins per board | 30 (more → flagged, rest added by hand) | `BOARD_MAX_PINS` |
| Boards per admin per day | 40 | `BOARD_SCAN_DAILY_LIMIT` |
| Boards processed at once per server | 2 (others queue) | `BOARD_CONCURRENT_SCANS` |
| Catalogue candidates per crop | 150 | `BOARD_MAX_CANDIDATES` |
| Same board photo uploaded again | reuses the earlier board | — |
| AI calls per board | 1 detection + 1 rank per pin + 1 comparison only when the ranking is unsure and a reference image exists (no describe call per pin) | `BOARD_DETECT_TILES=2` adds 4 detection calls |
| Pixian | automatic only for crops that are suitable, matched ≥ 70%, of a pin with no photo and no pending photo, best crop of that pin on the board, on a board with public-display permission. Identical crops are never cleaned twice. Everything else on request. | `BOARD_AUTO_CLEAN_MIN_CONFIDENCE` |
| "Approve all ready" | cleaned + (reviewed or ≥ 80%) + pin has no photo | `BOARD_BULK_APPROVE_MIN_CONFIDENCE` |

## Quality checks (starting thresholds — calibrate on real boards)

A crop is *suitable* for a catalogue photo when its shorter side is ≥ 280 px (`BOARD_MIN_CROP_SIDE_PX`), Laplacian sharpness ≥ 40 (`BOARD_MIN_SHARPNESS`), glare ≤ 8% blown-out pixels in the centre (`BOARD_MAX_GLARE`), it doesn't touch the photo edge, and detection didn't report it overlapped or partly hidden. Unsuitable crops are still matched (for collection use later) but not cleaned unless the reviewer asks. Nothing reconstructs hidden parts of a pin.

## Measuring the three test boards

```
# .env.staging also needs BOARD_BENCH_EMAIL / BOARD_BENCH_PASSWORD for a staging admin
pnpm --filter @workspace/api-server run staging:board-bench upload grogu.jpg ratatouille.jpg toy-story.jpg
# review each board in the app: confirm / correct / exclude ("Not a pin", "Duplicate") / add missed pins
pnpm --filter @workspace/api-server run staging:board-bench report <id> <id> <id> --expected expected.json
```

The metrics come from the review itself: a hand-added pin is a missed detection, "Not a pin" is a false detection, a changed pin is a wrong match. Set `BOARD_COST_USD_PER_M_INPUT`, `BOARD_COST_USD_PER_M_OUTPUT` and `PIXIAN_COST_USD_PER_IMAGE` for a cost estimate; otherwise tokens and call counts are reported.

Things to compare on the real boards: `BOARD_DETECT_TILES=1` vs `2` (detection on crowded boards), crop tightness on overlapping pins (Pixian keeps whatever it sees as foreground, so a neighbour's edge in the crop can survive clean-up — reject those photos and note how often), and the quality thresholds against what you'd actually publish. Google Vision is not used; only add it if these numbers show detection, not matching, is the bottleneck.

## Test boards — ground truth and findings

Photos are kept out of the repo. `expected.json` for the benchmark: `{ "toy-story": { "pins": 22 } }` (keyed by file name).

**Toy Story board** (maintainer's own photo, iPhone, own_photo + public display). 22 pins: Woody sketch (rose gold), claw machine Buzz/aliens, Buzz star, Mr Potato Head, Woody & Buzz box, Jessie star, Alien star, claw machine green (Rex), Rex on cloud, Woody/Rex/Slinky 30th, Aliens on cloud, claw machine Bullseye, Woody star, Bullseye star, claw machine orange (Woody), Rex star, Jessie & Woody riding, Pixar ball on cloud, Buzz rectangle (partly covered by a thumb), Buzz popsicle, claw machine red cow print, Toy Story vinyl.

Offline checks on 12 Nov 2026 (hand-drawn boxes; AI steps not run — no keys in that session):

- **Resolution is the deciding factor.** The copy received via chat was 1152×1536; every pin's crop was 121–235 px on its short side, so all 22 were correctly marked too small for a catalogue photo. At the original iPhone size (~3024×4032) the same pins are ~320–600 px and pass. Upload the original file (Photos "actual size"/AirDrop/the app picker), not a messaging-app copy, and ask Facebook contributors for originals — Facebook re-compresses to ~2048 px, which lands the smallest pins near the 280 px limit.
- **Sharpness** ranged 75–1245 (threshold 40): the check didn't misfire, but it can't be calibrated on a downscaled copy.
- **Glare:** the rose-gold Woody sketch pin is washed out by reflection, but no pixel was blown out (pixel glare 0). Brightness alone can't tell it from white enamel (Mr Potato Head, clouds), so detection now also reports `glare`.
- **Crowding:** sheriff stars and cloud pins interlock, so crops (6% padding) include points of neighbouring pins. Matching should cope (the prompt says to identify the centre pin); for clean-up, watch whether Pixian keeps the fragments and reject those photos — if common, the next step is to send Pixian an unpadded crop.
- The thumb over the Buzz rectangle is the occlusion case to check detection reports.

## Failure handling

Every step saves as it goes. A pin whose matching fails is marked failed and the board ends *Partly processed*; **Resume** redoes only unfinished pins (no new detection). A board left processing by a server restart shows as partial after 10 minutes. A failed Pixian call marks only that pin; **Clean photo** retries it.
