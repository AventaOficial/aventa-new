-- =============================================================================
-- AVENTA STAGING ONLY — Foundation gap patch (additive)
-- Target: oojshofrpbfwsiypcecr
-- NEVER run on mkgsrpsuvedwwlzmzmzh (production)
-- Date: 2026-09-17
-- =============================================================================
-- CONTEXT: W1/W1.5 already created canonical tables. This patch does NOT re-run
-- FOUNDATION_BASELINE_20260917.sql. It only closes verified gaps:
--   A) missing indexes from foundation baseline (CREATE INDEX IF NOT EXISTS)
--   B) one missing SELECT policy evidenced in FOUNDATION_BASELINE / prod reconstruction
--   C) canonical storage bucket offer-images + public read policy (evidenced)
--
-- FORBIDDEN: DROP TABLE, TRUNCATE, DELETE data, legacy bucket removal,
--            inventing INSERT storage policies without prod evidence,
--            distribution tables, Telegram/WhatsApp.
-- =============================================================================

-- Abort guard (manual): confirm project-ref === oojshofrpbfwsiypcecr before apply.

-- ---------------------------------------------------------------------------
-- A) Indexes missing vs FOUNDATION_BASELINE_20260917.sql
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles (role);
CREATE INDEX IF NOT EXISTS idx_offer_events_offer_event_created_at
  ON public.offer_events (offer_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_favorites_user_id ON public.offer_favorites (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_active_product_fingerprint
  ON public.offers USING btree (product_fingerprint)
  WHERE (
    (product_fingerprint IS NOT NULL)
    AND (product_fingerprint ~ '^(amz|ml):'::text)
    AND (deleted_at IS NULL)
    AND (status = ANY (ARRAY['pending'::text, 'approved'::text, 'published'::text]))
  );
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_key
  ON public.profiles (slug)
  WHERE ((slug IS NOT NULL) AND (slug <> ''::text));

-- note: offer_votes unique already present as offer_votes_offer_id_user_id_key
-- note: moderation_outcomes idempotency unique already present as moderation_outcomes_idempotency_key_key

-- ---------------------------------------------------------------------------
-- B) Policy gap: comments_select_approved_on_visible_offer
-- Evidence: FOUNDATION_BASELINE_20260917.sql (prod Gate0 reconstruction)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS comments_select_approved_on_visible_offer ON public.comments;
CREATE POLICY comments_select_approved_on_visible_offer ON public.comments
  FOR SELECT TO public
  USING (
    (status = 'approved'::text)
    AND (
      EXISTS (
        SELECT 1
        FROM public.offers o
        WHERE o.id = comments.offer_id
          AND o.status = ANY (ARRAY['approved'::text, 'published'::text])
      )
    )
  );

-- ---------------------------------------------------------------------------
-- C) Storage: canonical offer-images bucket (STAGING)
-- Evidence:
--   - app/api/upload-offer-image/route.ts → .from('offer-images')
--   - app/api/upload-profile-avatar/route.ts → .from('offer-images')
--   - prod bucket offer-images public=true
--   - docs/supabase-migrations/storage_offer_images_public.sql
--   - prod policy: "Allow public read offer-images" SELECT TO public
--
-- INSERT policies for offer-images: NOT present on production inventory →
-- intentionally NOT invented here (UNKNOWN). Legacy buckets preserved.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('offer-images', 'offer-images', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    name = EXCLUDED.name;

DROP POLICY IF EXISTS "Allow public read offer-images" ON storage.objects;
CREATE POLICY "Allow public read offer-images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'offer-images');

SELECT 'staging_foundation_gap_patch_ok' AS step;
