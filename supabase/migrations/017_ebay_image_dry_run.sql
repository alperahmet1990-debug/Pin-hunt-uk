-- eBay image dry-run: report-only tables. Never touches live pin image fields.
-- Written only by the API server via service role; admins read via the API.

create table if not exists ebay_image_dry_run_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  pins_examined int not null default 0,
  high_confidence_count int not null default 0,
  provisional_count int not null default 0,
  review_required_count int not null default 0,
  no_match_count int not null default 0,
  error_count int not null default 0,
  status text not null default 'running' check (status in ('running','completed','failed')),
  created_at timestamptz not null default now()
);

create table if not exists ebay_image_dry_run_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ebay_image_dry_run_runs(id) on delete cascade,
  pin_id uuid not null references pins(id) on delete cascade,
  pinhunt_id text not null,
  pin_name text not null,
  pin_metadata jsonb not null default '{}'::jsonb,
  queries_used jsonb not null default '[]'::jsonb,
  best_ebay_item_id text,
  marketplace text,
  listing_title text,
  listing_url text,
  image_url text,
  additional_image_urls jsonb not null default '[]'::jsonb,
  match_score int,
  confidence_classification text not null check (confidence_classification in
    ('high_confidence','provisional','review_required','no_match','error')),
  match_reasons jsonb not null default '[]'::jsonb,
  rejection_reasons jsonb not null default '[]'::jsonb,
  would_assign boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_ebay_dryrun_results_run on ebay_image_dry_run_results(run_id);

-- RLS on, no policies: only the service role (API server) can read/write.
alter table ebay_image_dry_run_runs enable row level security;
alter table ebay_image_dry_run_results enable row level security;
