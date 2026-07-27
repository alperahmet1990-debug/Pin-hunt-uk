-- Character enrichment fields from the master spreadsheet.
ALTER TABLE pins ADD COLUMN IF NOT EXISTS main_character TEXT;
ALTER TABLE pins ADD COLUMN IF NOT EXISTS all_characters TEXT;
ALTER TABLE pins ADD COLUMN IF NOT EXISTS character_confidence TEXT;
ALTER TABLE pins ADD COLUMN IF NOT EXISTS character_review_status TEXT;
