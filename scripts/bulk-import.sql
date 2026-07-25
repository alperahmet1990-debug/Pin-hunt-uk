-- One-off bulk import from /tmp/pin-import CSVs. Idempotent.
BEGIN;

CREATE TEMP TABLE stage_pins (
  pinhunt_id text, title text, brand text, collection text,
  release_year int, release_date text, retail_price numeric, currency text,
  limited_edition_size int, origin text, edition_type text,
  image_url text, back_image_url text, verification_status text
) ON COMMIT DROP;
CREATE TEMP TABLE stage_chars (pinhunt_id text, name text) ON COMMIT DROP;
CREATE TEMP TABLE stage_cats  (pinhunt_id text, name text) ON COMMIT DROP;
CREATE TEMP TABLE stage_ext   (pinhunt_id text, source text, external_id text) ON COMMIT DROP;
CREATE TEMP TABLE stage_srcs  (pinhunt_id text, source_url text) ON COMMIT DROP;

\copy stage_pins  FROM '/tmp/pin-import/pins.csv'  WITH (FORMAT csv)
\copy stage_chars FROM '/tmp/pin-import/chars.csv' WITH (FORMAT csv)
\copy stage_cats  FROM '/tmp/pin-import/cats.csv'  WITH (FORMAT csv)
\copy stage_ext   FROM '/tmp/pin-import/ext.csv'   WITH (FORMAT csv)
\copy stage_srcs  FROM '/tmp/pin-import/srcs.csv'  WITH (FORMAT csv)

-- 1. Pins
INSERT INTO pins (pinhunt_id, title, brand, collection, release_year, release_date,
                  retail_price, currency, limited_edition_size, origin, edition_type,
                  image_url, back_image_url, verification_status, status,
                  catalogue_source, catalogue_updated_at)
SELECT DISTINCT ON (pinhunt_id) pinhunt_id, title, brand, collection, release_year,
       NULLIF(release_date,'')::date, retail_price, currency, limited_edition_size,
       origin, edition_type, image_url, back_image_url, verification_status,
       'active', 'pinhunt_import', now()
FROM stage_pins
ON CONFLICT (pinhunt_id) DO UPDATE SET
  title = EXCLUDED.title, brand = EXCLUDED.brand, collection = EXCLUDED.collection,
  release_year = EXCLUDED.release_year, release_date = EXCLUDED.release_date,
  retail_price = EXCLUDED.retail_price, currency = EXCLUDED.currency,
  limited_edition_size = EXCLUDED.limited_edition_size, origin = EXCLUDED.origin,
  edition_type = EXCLUDED.edition_type, image_url = EXCLUDED.image_url,
  back_image_url = EXCLUDED.back_image_url,
  verification_status = EXCLUDED.verification_status, status = 'active',
  catalogue_source = 'pinhunt_import', catalogue_updated_at = now();

-- 2. Characters
INSERT INTO characters (name)
SELECT DISTINCT name FROM stage_chars
ON CONFLICT (name) DO NOTHING;

DELETE FROM pin_characters pc USING pins p
WHERE pc.pin_id = p.id AND p.pinhunt_id IN (SELECT DISTINCT pinhunt_id FROM stage_chars);

INSERT INTO pin_characters (pin_id, character_id)
SELECT DISTINCT p.id, c.id
FROM stage_chars sc
JOIN pins p ON p.pinhunt_id = sc.pinhunt_id
JOIN characters c ON c.name = sc.name;

-- 3. Categories
INSERT INTO categories (name)
SELECT DISTINCT name FROM stage_cats
ON CONFLICT (name) DO NOTHING;

DELETE FROM pin_categories pc USING pins p
WHERE pc.pin_id = p.id AND p.pinhunt_id IN (SELECT DISTINCT pinhunt_id FROM stage_cats);

INSERT INTO pin_categories (pin_id, category_id)
SELECT DISTINCT p.id, c.id
FROM stage_cats sc
JOIN pins p ON p.pinhunt_id = sc.pinhunt_id
JOIN categories c ON c.name = sc.name;

-- 4. External IDs (replace per pin+source)
DELETE FROM pin_external_ids pe USING pins p
WHERE pe.pin_id = p.id
  AND (p.pinhunt_id, pe.source) IN (SELECT pinhunt_id, source FROM stage_ext);

INSERT INTO pin_external_ids (pin_id, source, external_id)
SELECT DISTINCT p.id, se.source, se.external_id
FROM stage_ext se JOIN pins p ON p.pinhunt_id = se.pinhunt_id;

-- 5. Sources (insert missing)
INSERT INTO pin_sources (pin_id, source_url, source_name)
SELECT DISTINCT p.id, ss.source_url, 'spreadsheet'
FROM stage_srcs ss
JOIN pins p ON p.pinhunt_id = ss.pinhunt_id
WHERE NOT EXISTS (
  SELECT 1 FROM pin_sources x WHERE x.pin_id = p.id AND x.source_url = ss.source_url
);

COMMIT;

SELECT count(*) AS pins_total FROM pins;
