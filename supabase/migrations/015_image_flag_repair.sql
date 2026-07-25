-- 015: Repair stale needs_*_image flags.
-- Pins imported/updated before the import pipeline fix could have
-- needs_front_image / needs_back_image = true even though the
-- corresponding image URL is set. Clear those stale flags.

UPDATE pins
SET needs_front_image = false
WHERE needs_front_image = true
  AND image_url IS NOT NULL
  AND image_url <> '';

UPDATE pins
SET needs_back_image = false
WHERE needs_back_image = true
  AND back_image_url IS NOT NULL
  AND back_image_url <> '';
