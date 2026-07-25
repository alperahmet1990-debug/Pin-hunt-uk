-- 013: Allow admins to permanently delete pins from the catalogue.
-- Complements 009 (admin INSERT/UPDATE on pins). Junction rows in
-- pin_characters / pin_categories cascade via FK ON DELETE CASCADE.

CREATE POLICY "pins_admin_delete"
  ON public.pins
  FOR DELETE
  USING (is_admin());
