-- Catalogue validation: eBay-evidence based review of imported pin records.
-- All findings are suggestions; nothing touches pins until an admin approves.

CREATE TABLE IF NOT EXISTS ebay_validation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed')),
  requested_limit INTEGER NOT NULL DEFAULT 50,
  pins_checked INTEGER NOT NULL DEFAULT 0,
  strong_match_count INTEGER NOT NULL DEFAULT 0,
  probable_match_count INTEGER NOT NULL DEFAULT 0,
  needs_review_count INTEGER NOT NULL DEFAULT 0,
  no_match_count INTEGER NOT NULL DEFAULT 0,
  insufficient_data_count INTEGER NOT NULL DEFAULT 0,
  suspected_error_count INTEGER NOT NULL DEFAULT 0,
  suspected_duplicate_count INTEGER NOT NULL DEFAULT 0,
  api_calls_used INTEGER NOT NULL DEFAULT 0,
  api_error_count INTEGER NOT NULL DEFAULT 0,
  started_by UUID REFERENCES profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pin_ebay_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ebay_validation_runs(id) ON DELETE CASCADE,
  pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  pinhunt_id TEXT NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN
    ('strong_match', 'probable_match', 'needs_review', 'no_match', 'insufficient_data', 'error')),
  confidence_score INTEGER,
  match_count INTEGER NOT NULL DEFAULT 0,
  best_ebay_item_id TEXT,
  best_ebay_title TEXT,
  best_ebay_url TEXT,
  best_ebay_image_url TEXT,
  suggested_name TEXT,
  suggested_character TEXT,
  suggested_year INTEGER,
  suggested_edition_size INTEGER,
  suggested_edition_type TEXT,
  suggested_collection TEXT,
  suggested_release_location TEXT,
  suspected_duplicate_pin_id UUID REFERENCES pins(id),
  validation_notes TEXT,
  validation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_search_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_candidate_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  pin_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_status TEXT NOT NULL DEFAULT 'pending' CHECK (admin_status IN
    ('pending', 'approved', 'partially_approved', 'rejected', 'unable_to_verify')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_ebay_validations_run ON pin_ebay_validations(run_id);
CREATE INDEX IF NOT EXISTS idx_pin_ebay_validations_pin ON pin_ebay_validations(pin_id);
CREATE INDEX IF NOT EXISTS idx_pin_ebay_validations_admin_status ON pin_ebay_validations(admin_status);

-- Audit log for every admin-approved catalogue change (reversible).
CREATE TABLE IF NOT EXISTS pin_change_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id UUID NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  validation_id UUID REFERENCES pin_ebay_validations(id) ON DELETE SET NULL,
  changed_field TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_change_audit_pin ON pin_change_audit(pin_id);

-- RLS: admin-only via API server (service role); block anon/auth direct access.
ALTER TABLE ebay_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_ebay_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_change_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read validation runs" ON ebay_validation_runs;
CREATE POLICY "Admins read validation runs" ON ebay_validation_runs
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));
DROP POLICY IF EXISTS "Admins read validations" ON pin_ebay_validations;
CREATE POLICY "Admins read validations" ON pin_ebay_validations
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));
DROP POLICY IF EXISTS "Admins read pin audit" ON pin_change_audit;
CREATE POLICY "Admins read pin audit" ON pin_change_audit
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin));
