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
| Recognition | Same model (`OPENAI_SCAN_MODEL`), the Bulk Image Matcher's per-pin describe prompt (`bulkImages/match.ts`), catalogue search (`scanCandidates.ts`), ranking + photo-comparison prompts (shared in `pinRank.ts`, used by `/scan/identify` too), `scanVerify.ts` rules, `scanReasoning.ts` |
| Clean-up | `pixian.ts` (`normalizePinPhoto`, test mode, timeout/retry) |
| Approval + publishing | `pin_images` rows via `createContributedImage`, then `publishContributedImage` (watermark, public bucket, `pins.image_url`) |
| Storage | Cleaned photos in the existing private `pin-contributed-images` bucket; board photos and crops in a new private `board-scans` bucket |

Matching runs against the live staging catalogue, which is now Pin & Pop (~116k pins, `scripts/PINANDPOP.md`; this branch includes that work). Pin & Pop reference images are shown to the model during the comparison step only, through the scan's own lookup (`services/scanReferenceImages.ts`) — permitted internal recognition. They are never returned to the app, stored as crops or published; a pin matched from Pin & Pop still has no public photo until a board crop is approved.

## Setup (staging only)

1. Staging must already have the Pin & Pop catalogue and migrations 075–077. Apply `supabase/migrations/083_board_scans.sql` in the **staging** SQL editor (rollback SQL is in its header).
2. In the staging API server env: `BOARD_SCAN_ENABLED=true` (off by default — every board-scan route returns 404 and the Board Scans screen says it's switched off), `OPENAI_API_KEY` (low-budget staging key), `PIXIAN_API_ID`/`PIXIAN_API_SECRET`, `PIXIAN_TEST_MODE=true` (free, watermarked results — switch off only for a real run).
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
| AI calls per board | 1 detection, then per pin: 1 describe + 1 rank + 1 comparison whenever a reference image exists (≈ 3 per pin; a 22-pin board ≈ 65) | `BOARD_DETECT_TILES=2` adds 4 detection calls; `BOARD_MATCH_ALWAYS_COMPARE=false` compares only unsure rankings |
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

## Matching accuracy

Learned from the first real board (19 Nov 2026): the board-wide detection describes every pin in one look, which is too coarse to search 116k pins with ("Buzz Lightyear" matches thousands), and a confident ranking skipped the picture check, so plausible-sounding wrong pins showed at 94–96%. Now:

- **Describe each pin.** Before ranking, each detected pin is described from a close-up with 35% context around it (`describeItem` in `pipeline.ts`): its own characters, object type and printed text for the catalogue search, and a tight box. The crop is redone from that box when it overlaps the detected one (`refineBox`), so a box that cut the pin off or took in a neighbour is corrected. Hand-drawn boxes are described but kept as drawn. Runs once per pin; resuming a board doesn't repeat it.
- **Always compare.** The ranking is compared with reference images whenever any exist, however confident it is.
- **Only a picture makes a match confident.** Unchecked rankings show at most 60% (below automatic clean-up at 70%) with "Not checked against a picture". A checked match under 40% — no reference looked like the pin — is shown as not identified.

Second board (19 Nov 2026, a Grogu board) showed two more causes, now fixed:

- **The comparison showed only 3 pictures.** The scan's limit (`VERIFY_MAX_REFERENCES`) showed references for the top 3 candidates only, and the prompt lets an unpictured candidate keep its plausibility. When the 3 pictured candidates didn't match, the model promoted the 4th or 5th — whose Pin & Pop picture exists but it was never shown ("despite having no reference image"). Board matching now shows all ranked candidates' pictures (up to 5, `BOARD_MAX_REFERENCES`), and a candidate counts as checked only if its own picture was compared.
- **The search was built for a 13k catalogue** (`scanCandidates.ts`): a character on its own returns an arbitrary 120 of hundreds or thousands of pins, and specific words were searched across the whole catalogue after them, past the 150 cap. Board matching (`candidates.ts`) now searches each top character together with each specific word first (e.g. Grogu + "pod", Rex + "claw machine"), then printed text, then the broad search. The app's single-pin scan still uses the old search; it likely has the same weakness on the 116k catalogue.

Third board (19 Nov 2026, Disney Store "Tails of Friendship" silver-frame pins) showed the limit of text search: set pins are often titled by character only ("Meeko", "Pongo and Perdita"), and nothing in the catalogue text describes how they look ("silver frame"), so among hundreds of same-titled pins the right one can't be singled out. Boards are usually arranged by set, so:

- **Set on this board** (optional, at upload) is searched first for every pin: the set with each character, then the whole set (`candidates.ts`). Stored in `board_scans.stats.setHints`, so no migration.
- **Learned from confirmations:** confirming or correcting a pin adds its set (`pins.collection`) to the board, up to 5 sets, and re-matches the board's other undecided pins with it searched first (`learnSet`). A re-match skips the describe step (≈ 2 AI calls per pin). The ranking is also told which sets the board's other pins come from.
- The review card shows **Searched for:** (the describe step's characters, words and printed text), so a misread pin is obvious, and **Change pin** results show the Pin & Pop picture to the App Creator.

The same board also showed a picture check passing **the right art in the wrong format**: a Rhino in a silver frame matched a round Rhino booster pin at 98%, "checked". Disney reuses character art across round, framed, cut-out and dangle pins, and the shared comparison prompt judges the art. Board matching now adds a **format-first rule** (`FORMAT_RULES` in `match.ts`: outline, frame and its metal colour, dangles, spinners), asks for `format_match` per candidate, and caps a format mismatch at 35% (`FORMAT_MISMATCH_MAX`), below the 40% "checked" minimum, so it can't be cleaned automatically or approved in bulk. The card's reasoning starts "Different format from your pin."

If the right pin still isn't among the candidates, the next step is searching by picture similarity (an image index of reference photos), which needs a check of what Pin & Pop's terms allow.

## Straightening

After Pixian, a cleaned photo is turned straight when the pin has straight sides (`services/boardScan/straighten.ts`): the tilt is the rotation that gives the outline's convex hull the smallest bounding box, within ±25°. Round, star and other irregular pins (hull fills < 85% of that box) are left as they are. The reviewer can also **Straighten**, or turn by 3° with **↺ / ↻**, before approving. Every turn starts again from the un-turned clean-up (no quality lost to repeated turns) and is saved as `<base>.turn.<item>.<degrees>.jpg`; the previous turned file is removed, the shared base never is. Rejected or published photos can't be turned.

## Pin & Pop reference on the review screen

The App Creator (`profiles.is_app_creator`) sees each match's Pin & Pop reference image beside the crop, labelled *admin only*, and small ones on the alternatives — the same admin-only use as the Bulk Image Matcher. Other admins don't get them from the API. They are never stored or published.

## Failure handling

Every step saves as it goes. A pin whose matching fails is marked failed and the board ends *Partly processed*; **Resume** redoes only unfinished pins (no new detection). A board left processing by a server restart shows as partial after 10 minutes. A failed Pixian call marks only that pin; **Clean photo** retries it.
