-- Hardening for catalogue validation (post-review):
-- 1. Only one running validation run at a time, enforced at the DB level.
-- 2. Atomic apply of approved changes + audit rows in one transaction.
-- 3. keep_both preserved as its own admin decision.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_running_validation_run
  ON ebay_validation_runs ((true)) WHERE status = 'running';

ALTER TABLE pin_ebay_validations DROP CONSTRAINT IF EXISTS pin_ebay_validations_admin_status_check;
ALTER TABLE pin_ebay_validations ADD CONSTRAINT pin_ebay_validations_admin_status_check
  CHECK (admin_status IN ('pending', 'approved', 'partially_approved', 'rejected', 'unable_to_verify', 'keep_both'));

-- Atomic apply: pin update + audit rows commit together or not at all.
CREATE OR REPLACE FUNCTION apply_validation_changes(
  p_pin_id UUID,
  p_patch JSONB,
  p_audit JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE pins SET
    title = COALESCE(p_patch->>'title', title),
    release_year = COALESCE((p_patch->>'release_year')::int, release_year),
    limited_edition_size = COALESCE((p_patch->>'limited_edition_size')::int, limited_edition_size),
    edition_type = COALESCE(p_patch->>'edition_type', edition_type),
    collection = COALESCE(p_patch->>'collection', collection),
    origin = COALESCE(p_patch->>'origin', origin),
    image_url = COALESCE(p_patch->>'image_url', image_url),
    needs_front_image = CASE WHEN p_patch ? 'image_url' THEN false ELSE needs_front_image END,
    catalogue_updated_at = now(),
    updated_at = now()
  WHERE id = p_pin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pin % not found', p_pin_id;
  END IF;

  INSERT INTO pin_change_audit (pin_id, validation_id, changed_field, previous_value, new_value, reason, changed_by)
  SELECT
    p_pin_id,
    NULLIF(a->>'validation_id', '')::uuid,
    a->>'changed_field',
    a->>'previous_value',
    a->>'new_value',
    a->>'reason',
    NULLIF(a->>'changed_by', '')::uuid
  FROM jsonb_array_elements(p_audit) a;
END $$;

-- Service-role only; do not expose to normal clients.
REVOKE ALL ON FUNCTION apply_validation_changes(UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;

-- Optional series/collection scope for a run.
ALTER TABLE ebay_validation_runs ADD COLUMN IF NOT EXISTS filter_collection TEXT;
