---
name: Public shareable community posts
description: How the Facebook share flow exposes auth-only posts publicly without opening RLS
---
- Community posts stay auth-only in RLS; public access goes through the API server (service role) at /api/p/:slug using an unguessable hex `public_slug`, exposing only safe fields (no email/contact/exact location). Deleted posts 404 naturally.
- **Why:** avoids adding public SELECT policies to community tables; the slug is the capability.
- Share card is a 1080×1080 sharp composite (photo + SVG overlay), generated once, cached in the public `community-photos` bucket under `share-cards/`, URL stored on the post.
- Server-side image fetches for card generation must go through a host allowlist (supabase storage + i.ebayimg.com) — photos[] can hold arbitrary user URLs → SSRF otherwise.
- Share-click tracking uses an atomic RPC (`share_count = share_count + 1`), execute revoked from anon/authenticated; only tracks that the share flow opened, never claims a FB publish.
- App side: web uses navigator.share with canShare({files}) for the image; native uses RN Share; fallback modal offers copy text / download image / copy link / open Facebook.
