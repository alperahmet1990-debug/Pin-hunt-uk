-- Require newly attached Community and chat photos to use this Supabase
-- project's public community-photos URLs and sender-owned storage objects.

CREATE OR REPLACE FUNCTION is_valid_community_photo_url(
  p_photo_url TEXT,
  p_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  request_headers JSONB;
  request_host TEXT;
  expected_prefix TEXT;
  object_name TEXT;
BEGIN
  request_headers := NULLIF(current_setting('request.headers', true), '')::JSONB;
  request_host := request_headers ->> 'host';

  IF request_host IS NULL OR request_host = '' THEN
    RETURN FALSE;
  END IF;

  expected_prefix :=
    'https://' || request_host ||
    '/storage/v1/object/public/community-photos/' ||
    p_owner_id::TEXT || '/';

  IF p_photo_url NOT LIKE expected_prefix || '%' THEN
    RETURN FALSE;
  END IF;

  object_name := substring(p_photo_url FROM char_length(
    'https://' || request_host ||
    '/storage/v1/object/public/community-photos/'
  ) + 1);

  IF object_name = '' OR object_name LIKE '%?%' OR object_name LIKE '%#%' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'community-photos'
      AND name = object_name
  );
END;
$$;

REVOKE ALL ON FUNCTION is_valid_community_photo_url(TEXT, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION validate_conversation_photo_origins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  photo_url TEXT;
BEGIN
  IF NEW.message_type <> 'photo' THEN
    RETURN NEW;
  END IF;

  FOR photo_url IN
    SELECT value FROM jsonb_array_elements_text(NEW.photo_urls)
  LOOP
    IF NOT is_valid_community_photo_url(photo_url, NEW.sender_id) THEN
      RAISE EXCEPTION 'Photo must use the sender community storage URL';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_conversation_photo_origins_trigger
  ON conversation_messages;
CREATE TRIGGER validate_conversation_photo_origins_trigger
  BEFORE INSERT OR UPDATE ON conversation_messages
  FOR EACH ROW EXECUTE FUNCTION validate_conversation_photo_origins();

CREATE OR REPLACE FUNCTION validate_community_post_photos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  photo_value JSONB;
  photo_url TEXT;
BEGIN
  -- Existing legacy/external photos remain readable and do not block edits to
  -- unrelated post fields. Validation applies whenever the photo list changes.
  IF TG_OP = 'UPDATE' AND NEW.photos IS NOT DISTINCT FROM OLD.photos THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.photos) <> 'array'
     OR jsonb_array_length(NEW.photos) > 6 THEN
    RAISE EXCEPTION 'Posts may contain up to six photos';
  END IF;

  FOR photo_value IN
    SELECT value FROM jsonb_array_elements(NEW.photos)
  LOOP
    IF jsonb_typeof(photo_value) <> 'string' THEN
      RAISE EXCEPTION 'Post photos must be URL strings';
    END IF;

    photo_url := photo_value #>> '{}';
    IF NOT is_valid_community_photo_url(photo_url, NEW.author_id) THEN
      RAISE EXCEPTION 'Post photo must use the author community storage URL';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_community_post_photos_trigger
  ON community_posts;
CREATE TRIGGER validate_community_post_photos_trigger
  BEFORE INSERT OR UPDATE OF photos ON community_posts
  FOR EACH ROW EXECUTE FUNCTION validate_community_post_photos();