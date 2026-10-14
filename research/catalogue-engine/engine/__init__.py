"""PinHunt catalogue research engine (prototype).

Offline, evidence-first pipeline: evidence packets → validated claims →
per-field reconciliation → duplicate detection against the existing
catalogue → review queue → Excel + import-ready (inert) outputs.

Never writes to Supabase, never calls the app, never mints pinhunt_ids.
"""
SPEC_VERSION = 1
