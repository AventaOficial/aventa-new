# Prompt de contexto para la IA de Supabase

Copia y pega este prompt cuando necesites que la IA de Supabase tenga todo el contexto del proyecto AVENTA.

---

## Prompt

```
Proyecto: AVENTA — plataforma de ofertas comunidad de ofertas (México).

Stack: Next.js 16, Supabase (Postgres, Auth, Storage), Vercel.

Necesito que tengas este contexto completo para ayudarme con migraciones, RLS, funciones y consultas:

---

1) ESQUEMA ACTUAL

- public.offers: id, title, price, original_price, image_url, store, offer_url, description, status, created_by (FK profiles), created_at, expires_at, rejection_reason, risk_score, votes_count, upvotes_count, downvotes_count, outbound_24h, ctr_24h, ranking_momentum, is_featured, updated_at.

- public.profiles: id (FK auth.users), display_name, avatar_url, onboarding_completed, user_trust_score, created_at, updated_at.

- public.offer_votes: offer_id, user_id, value (1 o -1).

- public.offer_favorites: offer_id, user_id.

- public.offer_events: offer_id, user_id, event_type ('view', 'outbound', 'share'), created_at.

- public.moderation_logs: offer_id, user_id, action, previous_status, new_status, reason, created_at.

- public.offer_reports: offer_id, reporter_id, report_type, status, created_at.

- public.user_roles: user_id, role ('owner', 'admin', 'moderator', 'analyst').

- Vista public.ofertas_ranked_general: ofertas con up_votes, down_votes, score, ranking_momentum, score_final.

- Vista public.public_profiles_view: perfiles públicos (display_name, avatar_url).

- Materialized view public.offer_performance_metrics: views, outbound, shares, ctr, score, score_final.

---

2) FLUJO DE OFERTAS

- Creación: usuario autenticado crea con status = 'pending'.
- Moderación: moderador cambia a 'approved' o 'rejected' + rejection_reason (obligatorio al rechazar).
- risk_score se calcula en trigger BEFORE INSERT para status = 'pending'.
- La app filtra por status = 'approved' o 'published' para el feed.

---

3) RLS

- user_has_moderation_role(): helper que devuelve true si auth.uid() tiene rol owner/admin/moderator.
- moderation_logs, offer_reports: SELECT/INSERT restringidos a moderadores.
- offer_events: INSERT permitido (anon/authenticated) para tracking.

---

4) TRIGGERS

- trg_compute_risk_score: BEFORE INSERT en offers, calcula risk_score para status = 'pending'.
- recalculate_offer_metrics(offer_id): actualiza votes_count, ranking_momentum, etc.
- Trigger en offer_votes: AFTER INSERT/UPDATE/DELETE → recalculate_offer_metrics.

---

Con este contexto, ayúdame con [tu pregunta concreta].
```

---

## Uso

1. Copia el bloque entre las comillas invertidas.
2. Sustituye `[tu pregunta concreta]` por lo que necesites.
3. Pega en el chat de la IA de Supabase.
