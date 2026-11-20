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
| Reference pictures in the picture check | sent at `high` detail (≈ 765 input tokens each at 768px, vs 85 at `low`; up to 5 per pin ≈ 3.4k extra tokens per checked pin). Needed to tell frame metal, dangles and small text apart — the Rhino round-vs-framed mix-up. | `BOARD_REFERENCE_DETAIL=low` to save tokens |
| "Approve all ready" | match confirmed or corrected by the reviewer + cleaned + crop passed the quality check + pin has no photo. Never on confidence alone. | — |

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

- **Set on this board** (optional, at upload or with Scan again) is searched first for every pin: the set with each character, then the rest of the set (`candidates.ts`). A typed name is resolved to the exact catalogue collection when one fits ("tails friendship" → "Tails of Friendship"), and searched by that collection rather than as words. The rest of the board's sets fill at most 40% of the 150 candidates, so a big set (or several) can't push the precise character + word matches out. Stored in `board_scans.stats.setHints`, so no migration. Typing a set when uploading the same photo again adds it to the existing board, ready for Scan again.
- **Learned from confirmations:** once **two** confirmed or corrected pins on the board come from the same set (`pins.collection`), that set is added to the board, up to 5 sets, and the board's other undecided pins are re-matched with it searched first (`learnSet`; votes in `stats.setVotes`). One pin alone isn't enough: boards often mix sets, and one stray set would steer every other pin. Scan again with a set typed replaces the board's sets. A re-match skips the describe step (≈ 2 AI calls per pin). The ranking is also told which sets the board's other pins come from.
- The review card shows **Searched for:** (the describe step's characters, words and printed text), so a misread pin is obvious, and **Change pin** results show the Pin & Pop picture to the App Creator.

The same board also showed a picture check passing **the right art in the wrong format**: a Rhino in a silver frame matched a round Rhino booster pin at 98%, "checked". Disney reuses character art across round, framed, cut-out and dangle pins, and the shared comparison prompt judges the art. Board matching now adds a **format-first rule** (`FORMAT_RULES` in `match.ts`: outline, frame and its metal colour, dangles, spinners), asks for `format_match` per candidate, and caps a format mismatch at 35% (`FORMAT_MISMATCH_MAX`), below the 40% "checked" minimum, so it can't be cleaned automatically or approved in bulk. The card's reasoning starts "Different format from your pin."

When the picture check can't run (no reference picture, a download failed, the AI call failed), the card says so in plain words, and a match below the threshold shows as **Not identified — best guess** with a **Use best guess** button rather than **Confirm match**. Reference pictures are downloaded by the server (`references.ts`) before the comparison, so a Pin & Pop link the AI provider can't reach no longer fails the check silently; candidates are re-sorted after the caps.

When the right pin still isn't among the candidates, the picture index below adds the pins that look most like the crop.

## Picture index (finding pins by how they look)

Text search can't single out pins titled like hundreds of others ("Meeko") when nothing in the catalogue text describes them. The picture index (migration 085, `services/pictureIndex/`) describes every Pin & Pop reference picture as an image embedding — 256 numbers from Google Vertex AI `multimodalembedding@001`; the picture can't be rebuilt from them and isn't stored — so matching can also ask "which pins look most like this crop?".

- **Matching:** each crop is described the same way (one Vertex call, ≈ $0.0001) and the 30 closest pins go first in the candidates. The ranking reads titles only, so the 2 closest look-alikes not in its top 3 are always shown to the picture check too, where the pictures decide. Candidates found this way carry `lookalike: true`. If the picture search fails, matching carries on by text.
- **Building it:** Admin → Board Scans → **Picture index** → **Build picture index**. It runs in the background on the API server, paced to `PICTURE_INDEX_RATE_PER_MIN` (default 100, under Vertex's default quota — about 20 hours for 116k pictures; ask Google for a higher quota and raise it to go faster). Progress is saved as it goes: after a restart or **Stop**, **Continue building** picks up where it stopped. A picture that can't be downloaded is marked failed (**Retry failed**). A picture whose URL changes is described again. Cost ≈ $12 for the whole catalogue.
- **Switching it on (server env):** `PICTURE_INDEX_ENABLED=true`, plus the existing `GOOGLE_APPLICATION_CREDENTIALS_JSON`. Optional `VERTEX_PROJECT_ID` (defaults to the credentials' project) and `VERTEX_LOCATION` (default `us-central1`). In Google Cloud: enable the **Vertex AI API** on the project and give the service account the **Vertex AI User** role. Without these, the card says it's off and matching works as before.
- **One build at a time:** the guard is per server process. Render runs one instance, so that's enough today; with more instances, start a build on one only.
- **Rights:** reference pictures and crops are sent to Google Vertex AI (a processor alongside OpenAI). Maintainer decision, 20 Nov 2026 (`docs/catalogue-sync/PIN-AND-POP-QUESTIONS.md`, question 8; `scripts/PINANDPOP.md`). Service-role only; never returned to the app. Rollback: migration 085's header.

## Straightening

After Pixian, a cleaned photo is turned straight when the pin has straight sides (`services/boardScan/straighten.ts`): the tilt is the rotation that gives the outline's convex hull the smallest bounding box, within ±25°. Round, star and other irregular pins (hull fills < 85% of that box) are left as they are. The reviewer can also **Straighten**, or turn by 3° with **↺ / ↻**, before approving. Every turn starts again from the un-turned clean-up (no quality lost to repeated turns) and is saved as `<base>.turn.<item>.<degrees>.jpg`; the previous turned file is removed, the shared base never is. Rejected or published photos can't be turned.

## Pin & Pop reference on the review screen

The App Creator (`profiles.is_app_creator`) sees each match's Pin & Pop reference image beside the crop, labelled *admin only*, and small ones on the alternatives — the same admin-only use as the Bulk Image Matcher. Other admins don't get them from the API. They are never stored or published.

## Scanning again and deleting a board

Uploading the same photo again reopens the earlier board (same pixels, same board), so a board can't be re-run by re-uploading. On the board page:

- **Scan again** runs detection, describing, matching and clean-up again on the same photo, with the latest matching and an optional set. Its pins, crops, matches and cleaned photos (unless another board uses the same file) are replaced; the photo and its permission record are kept. Photo records a failed approval left pending are removed too.
- **Delete board** removes the board, its pins, its photo and crops, and cleaned photos no other board uses (identical crops share a cleaned file). The same photo can then be uploaded as a new board.

Both are refused while the board is processing, and once any photo from it is published: the board is that catalogue photo's record of where it came from (`pin_images.source_record_id` → `board_scan_items.id` → the board's permission record).

## Photos, approving and Pixian test mode

- **iPhone HEIC photos** can't be read by the server yet: the upload says so and asks for a JPEG export. Photos with transparency (e.g. a cropped PNG) keep their colours; a blank (all one colour) photo is refused before anything is stored.
- **Approve is safe to retry.** If publishing fails after the photo record was created, approving again reuses that pending record (provenance intact) rather than making a second one; a leftover record for a different pin is removed first.
- **Reject photo** isn't final: the pin goes back to **Clean photo**, and cleaning it again puts it back under review. Automatic clean-up leaves rejected photos alone.
- **Pixian test mode** (`PIXIAN_TEST_MODE=true`) returns watermarked photos. Their files are named `….pixian-test.jpg`; they are never reused once test mode is off, and approving one with test mode off is refused and sends the pin back to **Clean photo**.

## Failure handling

If the pin finder (detection) gives no answer or an unreadable one, the board fails with that reason (and **Resume** or **Scan again** retries) instead of showing "No pins were found". Every step saves as it goes. A pin whose matching fails is marked failed and the board ends *Partly processed*; **Resume** redoes only unfinished pins (no new detection). A board left processing by a server restart shows as partial after 10 minutes. A failed Pixian call marks only that pin; **Clean photo** retries it.
