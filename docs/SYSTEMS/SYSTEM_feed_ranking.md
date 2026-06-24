# SYSTEM — Feed y ranking

## Architecture

- **Fuente de datos:** Vista `ofertas_ranked_general` en Supabase (derivada de tabla offers). Incluye columnas calculadas: score, score_final, ranking_momentum, reputation_weighted_score, ranking_blend (ranking_momentum + reputation_weighted_score).
- **Frontend:** app/page.tsx (home) con vistas: Día a día (vitales), Top, Para ti, Recientes. Lectura del feed vía **`/api/feed/home`** (sin query directa a Supabase en browser para tabs). Búsqueda sigue en cliente por ahora.
- **Para ti:** API dedicada /api/feed/for-you que usa preferencias y votos del usuario (personalizado).
- **Orden:** vitales (Día a día) por ranking_blend con score cap; top por score_final; Recientes por created_at desc.
- **Día a día:** Solo moda, supermercado, hogar, belleza, viajes, servicios (+ legacy). Tecnología y Gaming no entran.

## Data flow

1. Usuario entra en / o cambia pestaña/filtros → fetchOffers o búsqueda.
2. Query a ofertas_ranked_general con .or('status.eq.approved,status.eq.published'), .or('expires_at.is.null,expires_at.gte...'), y opcionalmente .gte('created_at', ...), .in('category', ...), .eq('store', ...).
3. Resultados se mapean a formato Offer (rowToOffer) con author desde public_profiles_view (display_name, avatar_url, leader_badge, ml_tracking_tag).
4. En vitales se aplica filtro por score < DIA_A_DIA_SCORE_CAP y entrelazado por score; en Top por score_final; en Recientes paginación por created_at.
5. batchUserData carga voteMap y favoriteMap para las ofertas mostradas y se pasan a OfferCard.

## Database usage

- **ofertas_ranked_general:** Vista que expone id, title, price, original_price, image_url, image_urls, store, category, offer_url, description, steps, conditions, coupons, created_at, created_by, status, expires_at, up_votes, down_votes, score, score_final, ranking_momentum, reputation_weighted_score, ranking_blend.
- **public_profiles_view:** Join por created_by para autor (display_name, avatar_url, leader_badge, ml_tracking_tag). Necesaria para evitar 400 en select embebido.
- **offers:** Tabla base; triggers actualizan upvotes_count, downvotes_count, reputation_weighted_score.

## Edge cases

- **Vista sin category:** Si la vista no tiene columna category, las queries con .in('category', ...) devuelven 400. Aplicar migración fix_ofertas_ranked_general_category.sql.
- **Feed vacío:** Empty state en español; Reintentar en caso de error.
- **Recientes paginación:** cursor por last created_at; límite por página.
- **Recientes refresco:** polling cada 45 s en tab Recientes; evento `aventa:offer-published` tras subir oferta; refetch al volver a la pestaña. Realtime global (`ENABLE_OFFERS_REALTIME`) desactivado por rendimiento.
- **Búsqueda:** Términos escapados; ilike sobre título, store, descripción; mismo filtro status/expires_at.
