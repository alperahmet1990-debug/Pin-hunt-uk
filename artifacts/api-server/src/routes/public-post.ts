/**
 * Public shareable community-post pages.
 *
 * Community posts are auth-only in the app (RLS), but each post has an
 * unguessable public_slug. These endpoints use the service role to expose
 * ONLY safe fields on a public page — no email, exact location, or private
 * profile data. Deleted posts 404 automatically.
 *
 *   GET  /p/:slug             — public HTML page (with OG tags for Facebook)
 *   GET  /p/:slug/share-image — 1080×1080 branded share card (generated once, cached)
 *   POST /p/:slug/share-click — record that the user opened the share flow
 */
import { Router, type IRouter } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

const router: IRouter = Router();

const SLUG_RE = /^[a-f0-9]{10,64}$/;
const SHARE_BUCKET = "community-photos";

function makeAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
const admin = makeAdmin();

interface PublicPostRow {
  id: string;
  post_type: string;
  body: string;
  photos: string[];
  price_text: string | null;
  looking_for: string | null;
  location_text: string | null;
  share_image_url: string | null;
  share_count: number;
  created_at: string;
  profiles: { username: string | null; trading_region: string | null } | null;
  pins: { pinhunt_id: string; title: string; main_character: string | null; all_characters: string | null } | null;
}

const TYPE_LABEL: Record<string, string> = {
  for_trade: "FOR TRADE",
  for_sale: "FOR SALE",
  in_search_of: "IN SEARCH OF",
  new_pickup: "NEW PICKUP",
  discussion: "DISCUSSION",
};
const TYPE_COLOR: Record<string, string> = {
  for_trade: "#3B82F6",
  for_sale: "#16A34A",
  in_search_of: "#F59E0B",
  new_pickup: "#8B5CF6",
  discussion: "#64748B",
};

async function fetchPost(slug: string): Promise<PublicPostRow | null> {
  if (!admin || !SLUG_RE.test(slug)) return null;
  const { data } = await admin
    .from("community_posts")
    .select(
      `id, post_type, body, photos, price_text, looking_for, location_text,
       share_image_url, share_count, created_at,
       profiles(username, trading_region),
       pins(pinhunt_id, title, main_character, all_characters)`,
    )
    .eq("public_slug", slug)
    .maybeSingle();
  return (data as unknown as PublicPostRow) ?? null;
}

/** Resolve a photos[] entry (storage path or full URL) to a public URL. */
function photoUrl(entry: string): string | null {
  if (!entry) return null;
  if (/^https?:\/\//i.test(entry)) return entry;
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${SHARE_BUCKET}/${entry}`;
}

/**
 * Hosts the server is allowed to fetch images from when generating share
 * cards. Photos can be arbitrary user-supplied URLs, so without this an
 * attacker could point the server at internal hosts (SSRF).
 */
function isAllowedImageHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const supabaseHost = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname.toLowerCase() : "";
    return (
      (supabaseHost !== "" && host === supabaseHost) ||
      host === "i.ebayimg.com"
    );
  } catch {
    return false;
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── HTML page ─────────────────────────────────────────────────────────────────

router.get("/p/:slug", async (req, res) => {
  const post = await fetchPost(req.params.slug);
  if (!post) {
    res.status(404).send("<!doctype html><h1>This post is no longer available.</h1>");
    return;
  }
  const label = TYPE_LABEL[post.post_type] ?? "COMMUNITY POST";
  const color = TYPE_COLOR[post.post_type] ?? "#64748B";
  const mainPhoto = photoUrl(post.photos?.[0] ?? "");
  const username = post.profiles?.username ?? "A PinHunt collector";
  const characters = [
    ...new Set(
      [post.pins?.main_character, ...((post.pins?.all_characters ?? "").split(/[;,]/))]
        .map((c) => (c ?? "").trim())
        .filter(Boolean),
    ),
  ];
  // Always https — the app sits behind Replit's proxy, so req.protocol reports http.
  const shareImage = `https://${req.get("host")}${req.baseUrl}/p/${req.params.slug}/share-image`;
  const title = `${label} — ${post.pins?.title ?? post.body.slice(0, 60)}`;

  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | PinHunt UK</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(post.body.slice(0, 160))}">
<meta property="og:image" content="${esc(shareImage)}">
<meta property="og:type" content="website">
<style>
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f6f8;color:#111}
  .card{max-width:520px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .badge{display:inline-block;background:${color};color:#fff;font-weight:700;font-size:13px;letter-spacing:.05em;padding:5px 12px;border-radius:6px}
  img.main{width:100%;display:block;aspect-ratio:1;object-fit:cover;background:#eee}
  .inner{padding:18px 20px 22px}
  h1{font-size:19px;margin:10px 0 6px}
  p{line-height:1.5;margin:8px 0;white-space:pre-wrap}
  .meta{font-size:14px;color:#555;margin:4px 0}
  .meta b{color:#222}
  .cta{display:block;text-align:center;background:#1D4ED8;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:10px;margin-top:16px}
  .foot{text-align:center;font-size:12px;color:#888;margin:14px 0 24px}
</style></head><body>
<div class="card">
  ${mainPhoto ? `<img class="main" src="${esc(mainPhoto)}" alt="Pin photo">` : ""}
  <div class="inner">
    <span class="badge">${esc(label)}</span>
    <h1>${esc(post.pins?.title ?? "Disney pin post")}</h1>
    <p>${esc(post.body)}</p>
    ${characters.length ? `<div class="meta"><b>Characters:</b> ${esc(characters.join(", "))}</div>` : ""}
    ${post.price_text ? `<div class="meta"><b>Price / value:</b> ${esc(post.price_text)}</div>` : ""}
    ${post.looking_for ? `<div class="meta"><b>Looking for:</b> ${esc(post.looking_for)}</div>` : ""}
    ${post.location_text ? `<div class="meta"><b>Location / postage:</b> ${esc(post.location_text)}</div>` : ""}
    <div class="meta">Posted by <b>${esc(username)}</b> on PinHunt UK</div>
    <a class="cta" href="${esc(`https://${process.env.REPLIT_DEV_DOMAIN ?? req.get("host") ?? ""}`)}">Open PinHunt to contact ${esc(username)}</a>
  </div>
</div>
<div class="foot">PinHunt UK — the Disney pin trading community</div>
</body></html>`);
});

// ── Share-card image (1080×1080) ─────────────────────────────────────────────

async function generateShareCard(post: PublicPostRow): Promise<Buffer> {
  const label = TYPE_LABEL[post.post_type] ?? "PINHUNT POST";
  const color = TYPE_COLOR[post.post_type] ?? "#64748B";
  const title = (post.pins?.title ?? post.body).slice(0, 60);
  const value = post.price_text ?? "";

  // Base: the main post photo, cover-cropped to 1080×880.
  let photo: Buffer | null = null;
  const url = photoUrl(post.photos?.[0] ?? "");
  if (url && isAllowedImageHost(url)) {
    try {
      const r = await fetch(url);
      if (r.ok) photo = Buffer.from(await r.arrayBuffer());
    } catch { /* fall back to plain card */ }
  }
  const base = photo
    ? await sharp(photo).resize(1080, 880, { fit: "cover" }).toBuffer()
    : await sharp({ create: { width: 1080, height: 880, channels: 3, background: "#1e293b" } }).jpeg().toBuffer();

  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const overlay = Buffer.from(`<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="880" width="1080" height="200" fill="#ffffff"/>
    <rect x="40" y="40" rx="10" width="${label.length * 22 + 60}" height="72" fill="${color}"/>
    <text x="70" y="90" font-family="Arial, sans-serif" font-size="40" font-weight="bold" fill="#ffffff">${escXml(label)}</text>
    <text x="40" y="950" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="#111111">${escXml(title)}</text>
    ${value ? `<text x="40" y="1005" font-family="Arial, sans-serif" font-size="34" fill="#334155">${escXml(value.slice(0, 50))}</text>` : ""}
    <text x="40" y="1055" font-family="Arial, sans-serif" font-size="28" fill="#64748b">View on PinHunt UK</text>
    <text x="1040" y="1055" text-anchor="end" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#1D4ED8">PinHunt</text>
  </svg>`);

  return sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#ffffff" } })
    .composite([{ input: base, top: 0, left: 0 }, { input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

router.get("/p/:slug/share-image", async (req, res) => {
  const post = await fetchPost(req.params.slug);
  if (!post || !admin) { res.status(404).send("Not found"); return; }

  // Serve the cached card if we already generated one.
  if (post.share_image_url) {
    res.redirect(302, post.share_image_url);
    return;
  }
  try {
    const jpeg = await generateShareCard(post);
    const path = `share-cards/${post.id}.jpg`;
    const { error: upErr } = await admin.storage
      .from(SHARE_BUCKET)
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (!upErr) {
      const { data: pub } = admin.storage.from(SHARE_BUCKET).getPublicUrl(path);
      await admin
        .from("community_posts")
        .update({ share_image_url: pub.publicUrl })
        .eq("id", post.id);
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(jpeg);
  } catch (err) {
    console.error("[public-post] share card generation failed:", err);
    res.status(500).send("Could not generate share image");
  }
});

// ── Share-click tracking ──────────────────────────────────────────────────────

router.post("/p/:slug/share-click", async (req, res) => {
  const post = await fetchPost(req.params.slug);
  if (!post || !admin) { res.status(404).json({ error: "Not found" }); return; }
  // Atomic increment via RPC (read-then-write would drop concurrent clicks).
  const { error } = await admin.rpc("record_post_share_click", { p_slug: req.params.slug });
  if (error) {
    console.error("[public-post] share-click failed:", error.message);
    res.status(500).json({ error: "Could not record share" });
    return;
  }
  res.json({ ok: true });
});

export default router;
