-- =============================================================================
-- AVENTA STAGING ONLY — W1.5 synthetic seed
-- Target: oojshofrpbfwsiypcecr
-- NEVER run on mkgsrpsuvedwwlzmzmzh (production)
-- =============================================================================
-- Rollback: DELETE FROM public.offers WHERE title LIKE '[STAGING_W15_SEED]%';
--           (children cascade / manual delete of votes/events/comments first)
-- =============================================================================

-- Fixed UUIDs for deterministic smoke + rollback
-- approved: a1111111-1111-4111-8111-111111111101
-- pending:  a1111111-1111-4111-8111-111111111102

INSERT INTO public.offers (
  id, title, price, original_price, image_url, store, status, created_by,
  offer_url, description, category, tags, upvotes_count, downvotes_count
) VALUES (
  'a1111111-1111-4111-8111-111111111101',
  '[STAGING_W15_SEED] Auriculares demo aprobados',
  499.00,
  899.00,
  'https://placehold.co/600x600/png?text=AVENTA+STAGING',
  'Amazon',
  'approved',
  '6aa733d4-02cb-4c64-92fc-cf45fdcee344',
  'https://example.com/aventa-staging-safe',
  'Oferta sintética STAGING ONLY. No es un producto real.',
  'Electrónica',
  ARRAY['staging','seed']::text[],
  2,
  0
), (
  'a1111111-1111-4111-8111-111111111102',
  '[STAGING_W15_SEED] Teclado demo pendiente',
  799.00,
  1299.00,
  'https://placehold.co/600x600/png?text=AVENTA+PENDING',
  'Mercado Libre',
  'pending',
  '6aa733d4-02cb-4c64-92fc-cf45fdcee344',
  'https://example.com/aventa-staging-safe-pending',
  'Oferta sintética pendiente de moderación. STAGING ONLY.',
  'Electrónica',
  ARRAY['staging','seed','pending']::text[],
  0,
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.comments (
  id, offer_id, user_id, content, status
) VALUES (
  'b2222222-2222-4222-8222-222222222201',
  'a1111111-1111-4111-8111-111111111101',
  '6aa733d4-02cb-4c64-92fc-cf45fdcee344',
  '[STAGING_W15_SEED] Comentario demo aprobado',
  'approved'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.offer_events (
  offer_id, user_id, event_type
) VALUES (
  'a1111111-1111-4111-8111-111111111101',
  '6aa733d4-02cb-4c64-92fc-cf45fdcee344',
  'view'
);

SELECT 'staging_w15_seed_ok' AS step,
  (SELECT count(*)::int FROM public.offers WHERE title LIKE '[STAGING_W15_SEED]%') AS offers_seeded;
