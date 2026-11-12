# Running the "waiting for production" report

A step-by-step guide. No command line, no keys and no installs: you need a web browser and your Supabase dashboard login. It takes about 20–30 minutes.

The report compares the staging and production catalogues and lists what hasn't reached production:
- new pins, ID clashes and possible duplicates;
- field changes;
- approved and pending photos;
- staging-hosted files;
- board-scan and bulk-matcher work;
- which migrations each project has.

Nothing is matched automatically: every possible match is a decision for you.

---

## Is it safe?

**Nothing in either project can change.**
- Each query first switches the session to read-only (`set default_transaction_read_only = on`). Postgres then refuses any write, even an accidental one.
- The queries only read. There's no `insert`, `update`, `delete`, `drop`, `alter`, `create` or `grant` anywhere.
- The only other statement stores the result in a temporary session setting so it can be shown. It disappears when the editor's connection closes.

**What access it needs.**
- Your normal Supabase dashboard sign-in, with access to both projects and the SQL Editor.
- Leave the editor's role setting on its default, `postgres`, if you see one. Other roles (`anon`, `authenticated`) can't see unpublished pins, so the report would be wrong.
- No API keys, service-role keys or database passwords are used or needed.

The queries read these tables:
- **catalogue:** `pins`, `pin_images`, `pin_external_ids`, `pin_sets`, `characters`, `categories`, the link tables, `catalogue_sources`;
- **work queues:** `pin_submissions`, `board_scans` / `board_scan_items` and `bulk_image_batches` / `bulk_image_items` if they exist, research candidates;
- **file lists:** `storage.buckets`, `storage.objects` (names and sizes only);
- **Postgres's own catalogue,** to see which migrations exist.

**The comparison page runs only on your computer.**
- It's a single file you open in your browser.
- It contains a rule (a Content Security Policy) that blocks it from using the internet at all, so it can't upload anything even by mistake.
- Your files never leave your computer unless you choose to share the report.

## What the downloads contain

| Query | Contains | Never contains |
|---|---|---|
| 1 Summary | Counts: pins by status, photos by source, files per bucket, submissions by status. Which migrations exist. The rights settings of each image source. | Any individual record |
| 2 Pins | Every pin's catalogue fields (title, series, year, edition, status, description and so on), its photo links and its non–Pin & Pop external IDs (e.g. Collectible PinTrader) | Who created or edited it, private import data, Pin & Pop IDs (only a yes/no "has a Pin & Pop link") |
| 3 Photos | Every photo record: which pin, source, status, rights flag, link, whether a person uploaded it | Who uploaded or reviewed it. Pin & Pop rows appear only as "source: Pin & Pop", with no link or ID. |
| 4 Files | File names, sizes and checksums in the public catalogue bucket. For the private buckets (board scans, bulk uploads, contributed originals): sizes plus a scrambled stand-in for each name. | File contents. Private file names, which can include account ids. |
| 5 Work in progress | Submissions, board scans and bulk-matcher items: status, match decisions, PinHunt IDs, whether a cleaned photo exists, the permission flags. Board titles and supplier names you typed. | Who submitted or reviewed. Contributor names and handles, permission evidence text, private file paths. Draft submissions are only counted. |

**Keep the downloaded files private.** Put them in a folder that isn't shared or synced to other people, and delete them once we've finished the catch-up.

The **shareable** output is `report.md` (and optionally `review.csv`). The page checks these before you share (step 6).

---

## Step 1: Download the files from GitHub

1. Open https://github.com/alperahmet1990-debug/Pin-hunt-uk/tree/claude/supabase-staging-production-pp4kd6 while signed in to GitHub.
   - **Expect:** the repository page, with the branch name `claude/supabase-staging-production-pp4kd6` shown near the top left.
2. Press the green **Code** button, then **Download ZIP**.
   - **Expect:** a file like `Pin-hunt-uk-claude-supabase-staging-production-pp4kd6.zip` in your Downloads folder. It's large (around 180 MB) because the whole project comes with it.
3. Double-click the ZIP to unpack it.
   - **Expect:** a folder with the same name. You'll use two things inside it:
     - `supabase/verify/catalogue-gap/`: five files, `1_summary.sql` to `5_work.sql`;
     - `scripts/catalogue-gap/compare.html`: the comparison page.

## Step 2: Make two private folders

Make a new folder somewhere private, for example `Documents/PinHunt-Private/catalogue-gap-2026-11-12`. Inside it, make two folders called `staging` and `production`.

## Step 3: Run the five queries in **staging**

1. Open the Supabase dashboard and choose the **staging** project.
   - Check the project name in the top bar. Also note its **ref**: the 20 letters and numbers after `/project/` in the address bar. It's also under Project Settings → General → Project ID. You'll need it in step 5.
2. In the left menu, open **SQL Editor**, then start a **new query** (the + or "New query" button). You should have an empty editor.
3. Open `1_summary.sql` from the unpacked folder in a text editor:
   - **Mac:** right-click → Open With → TextEdit.
   - **Windows:** right-click → Open with → Notepad.
   Select everything (**Cmd+A** on Mac, **Ctrl+A** on Windows), copy (**Cmd+C** / **Ctrl+C**), click into the Supabase editor and paste (**Cmd+V** / **Ctrl+V**).
4. Press **Run** (or **Cmd+Enter** / **Ctrl+Enter**).
   - **Expect:** one row, with one column called `summary`. If you click the cell, `"environment"` should say `"staging"`. If it says `null`, that project doesn't have the 073 marker yet; that's fine, the report will remind you.
   - **If** the editor shows a warning about a "destructive operation", press **Cancel** and tell me. None of these queries should cause one.
5. Download the result. Use the export or download button above the results and choose **CSV** (it's usually called **Export → Download CSV**). Save it into your `staging` folder. **Any file name is fine:** the page recognises each file by what's inside.
6. Repeat steps 2–5 for `2_pins.sql`, `3_images.sql`, `4_storage.sql` and `5_work.sql`. What to expect:

| Query | Rows you should see |
|---|---|
| `1_summary` | 1 row (`summary`) |
| `2_pins` | about one row per 500 pins, e.g. 3 rows for 1,200 pins. Each row is a bundle, so the cells look like long text. That's expected. |
| `3_images` | one row per 500 photo records |
| `4_storage` | one row per 500 files. If it says **"Success. No rows returned"**, there's nothing to download; skip it. |
| `5_work` | 1 row (`work`) |

**Expect at the end:** four or five CSV files in `staging`.

## Step 4: Run the same five queries in **production**

Switch to the **production** project in the dashboard (check the name!) and repeat step 3. Save into the `production` folder and note production's ref.

Run staging and production close together. If you know a board scan or batch is running, wait for it to finish if you can. The report is a snapshot either way.

## Step 5: Compare (in your browser, offline)

1. In the unpacked folder, open `scripts/catalogue-gap/` and double-click `compare.html`.
   - **Expect:** a page titled "Catalogue gap report" in your browser. Safari, Chrome, Edge and Firefox all work.
2. **Step 1 on the page:** press **Choose Files**, go to your `staging` folder, select all the files (**Cmd+A** / **Ctrl+A**) and press Open.
   - **Expect:** each file listed with what it was recognised as ("1 summary", "2 pins" and so on), and "All five results present". "4 files … optional" is fine if query 4 returned no rows.
3. **Step 2 on the page:** do the same with your `production` folder.
4. **Step 3 on the page:** type the staging ref and the production ref.
   - The page shows the refs it found in your files, to help you check. Note that **both** refs can appear in staging files, because staging pins copied from production use production's photo links.
5. Press **Compare**.
   - **Expect:** a green "Export checks passed" message, or messages explaining a problem (see Troubleshooting). Then a **Before you share** section and the full report.

## Step 6: Check before sharing

1. **Privacy check (automatic).**
   - **Green** means none of the following were found: email addresses, keys or tokens, Pin & Pop links, private storage paths, or either project ref. (The refs are replaced with STAGING and PRODUCTION automatically.)
   - It also lists what it *expects* to find: PinHunt IDs and internal record ids of pins and photos, which are catalogue records, not people.
   - **Red** means don't share. Tell me what it lists and I'll explain or fix it.
2. **Your own look (2 minutes):** scroll through the report on the page.
   - You should see pin titles, PinHunt IDs, series names, counts, photo record ids and migration numbers.
   - You should **not** see any person's name or email, any account details, or any Pin & Pop link or ID.
   - Board titles and bulk supplier names that you typed don't appear in the report.
3. **Download:** press **Download report.md** (and **Download review.csv** if you want to start deciding items).
   - `review.csv` opens in Numbers, Excel or Google Sheets. It has one row per decision and an empty `decision` column for you.
4. **Share** `report.md` with me in this conversation. That's enough for me to size the catch-up. `review.csv` is also safe to share; it has the same content as a table.

**Keep these to yourself:** the downloaded CSV files from steps 3–4. They hold the complete catalogue exports, which you may not want to circulate.

---

## Troubleshooting

| You see | What it means | What to do |
|---|---|---|
| "The staging folder says it came from production" (or the reverse) | The files were saved into the wrong folders | Swap them, or re-run the queries |
| "no project marker … can't prove which project it came from" | That project doesn't have migration 073's marker yet | Fine to continue. Just double-check you ran each query in the right project. |
| "…has N rows but the project has M. The export was cut short" | The download is incomplete | Re-run that query and download again. If it keeps happening, tell me the numbers. |
| "no summary result found" / "no pins result found" | A file is missing or was saved from the wrong query | Re-run that query in that project and add the file |
| "more than one summary file" | The same query was saved twice | Remove the extra copy |
| "not recognised (ignored)" next to a file | Not one of the five results, e.g. a stray file in the folder | Ignore it, or take it out |
| An error in the SQL editor | Something in that project differs from what I expected | Copy the error message (not the data) to me |

## For later: the same comparison in a terminal (optional)

If you're comfortable with a terminal and have Node.js 20 or newer, run this from the unpacked folder:

```sh
node scripts/catalogue-gap/compare.mjs ~/Documents/PinHunt-Private/catalogue-gap-2026-11-12 \
  --staging-ref <staging ref> --production-ref <production ref>
```

It writes the same `report.md` and `review.csv` into that folder and prints the same privacy check.

## How it was tested

- `node --test scripts/catalogue-gap/*.test.mjs` covers the comparison rules, file recognition, the privacy check, and that `compare.html` matches the code.
- The queries were run against a local in-memory replay of the migrations (PGlite, the same harness as `supabase/verify/local-replay.mjs`), in two shapes:
  - a staging-like database with 045, 075 and 076;
  - a production-like database without them, with 1,200 extra archived pins.
- The read-only session was confirmed to reject writes.
- The page was tested in a headless browser with files named the way the SQL editor names them. It made zero network requests.

**Not testable here:** the hosted SQL editor itself, which needs your dashboard login. The page tells you if an export is cut short or comes from the wrong project.
