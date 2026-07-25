---
name: Expo web photo uploads
description: Why photo uploads silently break on Expo web and the working pattern
---
Two independent web-only failures in photo upload paths:
1. The RN FormData file-descriptor trick (`formData.append('file', {uri,name,type})`) uploads a **0-byte** file to Supabase Storage on web. Web must upload a real Blob.
2. `expo-image-manipulator`'s manipulateAsync is unreliable on web (rejects with a raw HTMLCanvasElement). Web must compress via createImageBitmap({imageOrientation:'from-image'}) → canvas → toBlob('image/jpeg'), with <img> decode fallback.
**How to apply:** any upload utility must branch on Platform.OS==='web' (see utils/communityPhoto.ts as the reference implementation). utils/submissionImage.ts still uses manipulateAsync unguarded — same risk for submission photos on web (related proposed task exists).
Storage note: cannot DELETE storage.objects via SQL (trigger blocks it) — use the Storage API with the service-role key.
