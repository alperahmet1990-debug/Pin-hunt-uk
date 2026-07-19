-- ============================================================
-- PinHunt UK — Migration 004: External Marketplace Listings
--
-- Run AFTER 001, 002, 003.
--
-- Creates the external_sale_listings table, indexes, updated_at
-- trigger, and RLS policies. No payments are processed here —
-- buyers are sent to the external marketplace to complete purchase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.external_sale_listings (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID          NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  pin_id       UUID          NOT NULL REFERENCES public.pins(id)       ON DELETE CASCADE,
  platform     TEXT          NOT NULL
                               CHECK (platform IN ('vinted', 'ebay', 'other')),
  listing_url  TEXT          NOT NULL,
  asking_price NUMERIC(10,2),
  currency     TEXT,
  status       TEXT          NOT NULL DEFAULT 'active'
                               CHECK (status IN ('draft', 'active', 'sold', 'expired', 'removed')),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS esl_seller_idx ON public.external_sale_listings (seller_id);
CREATE INDEX IF NOT EXISTS esl_pin_idx    ON public.external_sale_listings (pin_id);
CREATE INDEX IF NOT EXISTS esl_status_idx ON public.external_sale_listings (status);
CREATE INDEX IF NOT EXISTS esl_pin_active_idx ON public.external_sale_listings (pin_id, status)
  WHERE status = 'active';

CREATE TRIGGER external_sale_listings_updated_at
  BEFORE UPDATE ON public.external_sale_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.external_sale_listings ENABLE ROW LEVEL SECURITY;

-- Sellers can read all their own listings (any status)
CREATE POLICY "esl_select_own"
  ON public.external_sale_listings FOR SELECT
  USING (seller_id = auth.uid());

-- Anyone can read active listings whose seller has a public profile
-- and whose pin is verified
CREATE POLICY "esl_select_public"
  ON public.external_sale_listings FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = seller_id
        AND p.profile_visibility = 'public'
        AND p.username IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.pins pin
      WHERE pin.id = pin_id
        AND pin.verification_status = 'verified'
    )
  );

-- Sellers can create their own listings
CREATE POLICY "esl_insert_own"
  ON public.external_sale_listings FOR INSERT
  WITH CHECK (seller_id = auth.uid());

-- Sellers can update only their own listings
CREATE POLICY "esl_update_own"
  ON public.external_sale_listings FOR UPDATE
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

-- Sellers can delete only their own listings
CREATE POLICY "esl_delete_own"
  ON public.external_sale_listings FOR DELETE
  USING (seller_id = auth.uid());
