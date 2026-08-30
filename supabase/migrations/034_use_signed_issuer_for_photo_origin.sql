-- Supabase does not guarantee that the HTTP Host header is exposed through
-- request.headers. Derive the trusted project URL from the signed user JWT
-- issuer instead.

CREATE OR REPLACE FUNCTION is_valid_community_photo_url(
  p_photo_url TEXT,
  p_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, auth, pg_temp
AS $$
DECLARE
  jwt_issuer TEXT;
  project_url TEXT;
  expected_prefix TEXT;
  object_name TEXT;
BEGIN
  jwt_issuer := auth.jwt() ->> 'iss';

  IF jwt_issuer IS NULL
     OR jwt_issuer NOT LIKE 'https://%.supabase.co/auth/v1' THEN
    RETURN FALSE;
  END IF;

  project_url := regexp_replace(jwt_issuer, '/auth/v1$', '');
  expected_prefix :=
    project_url ||
    '/storage/v1/object/public/community-photos/' ||
    p_owner_id::TEXT || '/';

  IF p_photo_url NOT LIKE expected_prefix || '%' THEN
    RETURN FALSE;
  END IF;

  object_name := substring(p_photo_url FROM char_length(
    project_url || '/storage/v1/object/public/community-photos/'
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