# Cleaning catalogue images with Pixian (#367)

`scripts/clean-catalogue-images.mjs` gives catalogue pin photos the same look as contributed photos: white background, cropped to the pin, 1200×1200. It uses the same Pixian settings as the app (`src/services/pixian.ts`).

You run it on your own laptop. It only works against **staging**: the staging guard refuses anything else. Nothing goes live until you review the results and run `publish --apply`.

## Before you start

- Node 22.18 or newer (`node --version`).
- `artifacts/api-server/.env.staging` set up as for `staging:import-catalogue`, plus your Pixian keys:
  ```
  PIXIAN_API_ID=...
  PIXIAN_API_SECRET=...
  ```
  Never commit this file or paste its values anywhere.
- Run every command from `artifacts/api-server`. Files go in `./catalogue-image-clean/`, which git ignores. Use `--dir` to change that.

## 1. Fetch some pins (read-only)

```
node --env-file=.env.staging scripts/clean-catalogue-images.mjs fetch --limit 10
node --env-file=.env.staging scripts/clean-catalogue-images.mjs fetch --pinhunt-ids PHUK-00000001,PHUK-00000002
node --env-file=.env.staging scripts/clean-catalogue-images.mjs fetch --ids-file my-pins.txt        # one ID per line
node --env-file=.env.staging scripts/clean-catalogue-images.mjs fetch --source collectible_pintrader --limit 20
```

This downloads each pin's current image into `originals/`. It skips (and lists) pins whose image source is unknown, or whose `catalogue_sources` row doesn't allow storing and showing its images. Pin & Pop images are always skipped.

## 2. Clean them

```
node --env-file=.env.staging scripts/clean-catalogue-images.mjs clean --test     # free, watermarked: for trying it out
node --env-file=.env.staging scripts/clean-catalogue-images.mjs clean --paid     # uses Pixian credits
```

You have to pick one. Each run does at most 10 images; use `--limit N` or `--all` for more. Re-runs skip images that are already cleaned. A paid run redoes images that only have a test result.

## 3. Review

```
node --env-file=.env.staging scripts/clean-catalogue-images.mjs review
```

Open `catalogue-image-clean/review.html` in a browser. It shows before and after side by side. Tick the ones you like, press **Download review.json**, and save it into `catalogue-image-clean/` (replacing the old one). You can also edit `review.json` by hand: `true` means approved.

Test results are marked and can never be published.

## 4. Publish

```
node --env-file=.env.staging scripts/clean-catalogue-images.mjs publish            # dry run: lists what would happen
node --env-file=.env.staging scripts/clean-catalogue-images.mjs publish --apply    # writes
```

For each approved, paid result, this:
- uploads the cleaned image as a **new** file in the `pin-catalogue` bucket (`cleaned/<PinHunt ID>/…`). The original file is never touched.
- points `pins.image_url` at it, but only if the pin still shows the image you cleaned.
- adds a `pin_images` row noting it was cleaned with Pixian and what the original URL was.

It refuses any source whose licence isn't confirmed to allow edited images. That means `catalogue_sources.exact_license_variant` must be filled in, must not say "pending", and must not be a no-derivatives licence. **Collectible PinTrader is still "pending confirmation"**, so its images can be cleaned and reviewed but not published. Once the developer confirms that edits are fine, record the confirmed licence in that row (and in the rights record), then publish.

## Undo

```
node --env-file=.env.staging scripts/clean-catalogue-images.mjs revert                          # dry run
node --env-file=.env.staging scripts/clean-catalogue-images.mjs revert --apply                  # every published pin
node --env-file=.env.staging scripts/clean-catalogue-images.mjs revert --apply --pinhunt-ids PHUK-00000001
```

This puts the original image back, for pins still showing the cleaned copy. It uses `manifest.json` in the working folder, so keep that folder until you're happy. The original URL is also in each cleaned `pin_images` row, if the folder is lost.

## Cost

Check your Pixian credit balance and per-image price before a paid run. Try `--test --limit 10` first, then a small `--paid --limit 10` batch, before anything bigger.
