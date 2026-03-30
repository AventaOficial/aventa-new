# Contexto Supabase — AVENTA

Referencia del esquema y objetos que usa el proyecto. El “Copy as SQL” del Dashboard es **solo contexto** (orden y restricciones pueden no ser ejecutables tal cual); aquí se resume lo relevante para desarrollo.

---

## 1. Schema `public` — Tablas principales

| Tabla | Descripción | Columnas clave |
|-------|-------------|----------------|
| **announcements** | Avisos del sitio (campana). Solo activos visibles. | id, title, body, link, active, sort_order, created_by |
| **app_config** | Configuración global key/value (ej. show_tester_offers). | key (PK), value (jsonb) |
| **comment_likes** | Likes en comentarios. | comment_id, user_id |
| **comments** | Comentarios en ofertas (pending/approved/rejected). | offer_id, user_id, content, status, parent_id |
| **moderation_logs** | Log de cambios de estado en moderación. | offer_id, user_id, action, previous_status, new_status, reason, metadata |
| **notifications** | Notificaciones in-app (campana). | user_id, type, title, body, link, read_at |
| **offer_events** | Eventos por oferta: view, outbound, share. Base para vistas/clics/CTR. | offer_id, user_id, event_type, created_at |
| **offer_favorites** | Favoritos por usuario. | user_id, offer_id |
| **offer_quality_checks** | Revisión de calidad (precio, descripción, etc.). | offer_id, reviewer_id, is_valid_price, … |
| **offer_reports** | Reportes por oferta. | offer_id, reporter_id, report_type, status, comment |
| **offer_votes** | Votos: value 2 (up), 1 (neutral), -1 (down). Score = up×2 − down. | offer_id, user_id, value |
| **offers** | Ofertas: título, precio, tienda, estado, métricas. | id, title, price, store, status, created_by, votes_count, outbound_24h, ctr_24h, ranking_momentum, … |
| **profiles** | Perfil extendido (username, display_name, reputación, badges). | id (FK auth.users), username, display_name, reputation_score, leader_badge, ml_tracking_tag, … |
| **user_activity** | Primera/última actividad para retención 48h y activos 24h. | user_id, first_seen_at, last_seen_at |
| **user_bans** | Baneos. | user_id, banned_by, reason, expires_at |
| **user_email_preferences** | Preferencias de correo (digest diario/semanal). | user_id, email_daily_digest, email_weekly_digest |
| **user_roles** | Roles admin: owner, admin, moderator, analyst. | user_id, role |

Vistas/materialized que usa el proyecto (entre otras): `offer_performance_metrics` (métricas por oferta desde offer_events + offer_votes), `ofertas_ranked_general` (feed ranking).

### Convenciones (fuente de verdad y tablas aparcadas)

| Tema | Convención |
|------|------------|
| **Nombre desde /settings** | `profiles.name_saved_in_settings_at` + `display_name_updated_at` para el límite de 14 días. La app no mantiene esa marca en `auth.user_metadata` (si quedaba de versiones anteriores, se copia a `profiles` y se borra en Auth). Migración: `docs/supabase-migrations/profiles_name_saved_in_settings_at.sql`. |
| **Votos** | El código usa **`offer_votes.value`** (pesos según reputación). La columna **`vote`** (smallint) se considera legado; no usar en código nuevo. |
| **`communities` / `community_offers`** | Existen en `public`; la web redirige `/communities` y no hay flujo producto. No construir features nuevas sobre ellas hasta definir roadmap. |
| **`offer_quality_checks`** | Sin uso en el repositorio actual; revisar antes de invertir en reporting. |

---

## 2. Funciones (Database Functions) usadas

| Nombre | Uso |
|--------|-----|
| **compute_offer_risk_score** | Cálculo de risk_score por oferta. |
| **enforce_display_name_change_limit** | Trigger: límite cambio de nombre (ej. 14 días). |
| **get_profile_by_slug** | Obtener perfil por slug/username. |
| **get_user_vote** | Voto del usuario en una oferta. |
| **handle_new_user** | Trigger: crear profile al registrarse. |
| **increment_offers_approved_count** / **rejected_count** / **submitted_count** | Actualizar contadores en profiles. |
| **offer_vote_summary** | Resumen up/down/score por oferta. |
| **offer_votes_counter_trigger** / **offer_votes_recalculate_function** | Triggers en votos. |
| **recalculate_offer_metrics** | Actualiza offers (votes_count, outbound_24h, ctr_24h, ranking_momentum) — se llama desde trigger en offer_votes. |
| **recalculate_offer_reputation_weighted_score** / **recalculate_user_reputation** | Reputación. |
| **refresh_offer_performance_metrics** | REFRESH de la materialized view (API admin). |
| **reputation_level_from_score** | Nivel de reputación desde puntuación. |
| **set_updated_at** | Trigger updated_at en offers. |
| **trigger_compute_risk_score** | Trigger risk_score en offers. |
| **trigger_recalculate_after_event** | Recalcular métricas tras insert en offer_events. |
| **trigger_recalculate_offer_on_vote** | Recalcular oferta al votar. |
| **upsert_user_activity** | Actualizar first_seen_at / last_seen_at. |

---

## 3. Triggers relevantes

| Trigger | Tabla | Función | Eventos |
|---------|-------|---------|--------|
| enforce_display_name_change_limit_trigger | profiles | enforce_display_name_change_limit | BEFORE UPDATE |
| offer_votes_reputation_weighted_trigger | offer_votes | trg_offer_votes_reputation_weighted | AFTER INSERT/UPDATE/DELETE |
| trg_after_event_insert | offer_events | trigger_recalculate_after_event | AFTER INSERT |
| trg_compute_risk_score | offers | trigger_compute_risk_score | BEFORE INSERT |
| trg_offer_votes_recalculate | offer_votes | trigger_recalculate_offer_on_vote | AFTER INSERT/UPDATE/DELETE |
| trigger_set_updated_at | offers | set_updated_at | BEFORE UPDATE |

---

## 4. Extensiones habilitadas (las que usamos)

- **pgcrypto** — Funciones criptográficas.
- **pg_stat_statements** — Estadísticas de consultas (Query Performance).
- **pg_graphql** — GraphQL (Supabase).
- **uuid-ossp** — Generación de UUIDs.
- **pg_cron** — Cron (Supabase Cron, ej. digest correos).
- **plpgsql** — Lenguaje procedural.

Otras extensiones pueden estar instaladas en el proyecto por defecto (postgis, vector, etc.); el producto AVENTA no las usa de forma directa en la app.

---

## 5. Otros esquemas (gestión Supabase)

- **auth** — Usuarios, sesiones, identidades, OAuth. No modificar desde la app; usar Auth API.
- **storage** — Buckets e objetos (imágenes de ofertas, etc.).
- **realtime** — Suscripciones en tiempo real (ofertas).
- **cron** — Jobs programados (pg_cron).
- **realtime** (schema): tablas como `messages`, `subscription` para realtime; el producto usa principalmente `public.offers` para realtime.

Para detalles de columnas de `auth.users` o `storage.objects`, ver documentación de Supabase.

---

## 6. Índices

Los índices en `public` están pensados para: búsqueda por status/created_at en offers, por offer_id/user_id en offer_events y offer_votes, por user_id en activity/notifications, y por created_at en moderation_logs. La lista completa se ve en Dashboard → Database → Indexes.

---

## 7. Producción y linter

**Comprobar que estás en producción:** El proyecto que ves en el Dashboard de Supabase es tu base de datos; si tu app en Vercel (producción) usa las variables de ese proyecto, ese es tu entorno de producción. Database → Data API / Logs muestran las peticiones reales.

**Security y Performance (Database Linter):** En Report → Security / Performance aparecen recomendaciones opcionales: vistas con SECURITY DEFINER, funciones con search_path mutable, políticas RLS con auth.uid() (mejor (select auth.uid()) para rendimiento), políticas duplicadas o permisivas, índices duplicados. No bloquean; se pueden ir corrigiendo cuando priorices.

---

Este doc se puede actualizar cuando se añadan tablas, funciones o triggers nuevos. El SQL “Copy as SQL” del Dashboard sirve como referencia de estructura, no como script único de ejecución.
