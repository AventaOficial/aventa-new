# Contexto AVENTA — para asistentes (ChatGPT, etc.)

Copia este bloque cuando cambies de herramienta o quieras alinear memoria con otra IA.

## Qué es AVENTA

- **Web** (Next.js App Router, React, Tailwind) en **aventaofertas.com**: comunidad que **encuentra y comparte ofertas** (no vendemos productos).
- **Backend:** Supabase (Postgres, Auth, RLS, Realtime). Ofertas pasan por **moderación** salvo reglas de reputación.
- **Extensión Chrome** (carpeta `browser-extension/`): envía datos de Amazon/Mercado Libre a la ruta `/subir` con query params; la app abre el modal de subir oferta.

## Rutas y roles importantes

- **Público:** `/`, `/oferta/[id]` (canonical; redirect 301 desde `/?o=id`), `/descubre`, `/extension`, categorías/tiendas.
- **Usuario logueado:** `/me` (perfil y métricas), `/settings`, favoritos.
- **Solo owner (fundador):** `/operaciones` (centro de operaciones), `/contexto` (mapa de enlaces al admin). **No** están en el menú del avatar; se entran por **sidebar del panel admin** o URL directa.
- **Admin** (`/admin/*`): moderación, usuarios, logs, métricas, equipo, **Peso de voto** (`/admin/vote-weights`, solo owner).

## Votos y ranking

- Tabla `offer_votes`: `value` **2** = like, **-1** = dislike (API `POST /api/votes`).
- Trigger `recalculate_offer_metrics`: actualiza `offers.upvotes_count` (nº de personas), `ranking_momentum`, etc.
- **Peso por usuario (owner):** columna `profiles.vote_weight_multiplier` (default 1). Cada like aporta **2 × multiplicador** al `ranking_momentum`. Migración: `docs/supabase-migrations/profiles_vote_weight_multiplier.sql`. UI: `/admin/vote-weights`.

## Correos (Resend + crons)

- **Diario** (`/api/cron/daily-digest`): usuarios con `email_daily_digest` en `user_email_preferences`. Ofertas **del día civil** en `DIGEST_TIMEZONE` (default `America/Mexico_City`), top por `upvotes_count`. Vercel: `vercel.json` cron `0 1 * * *` (~19:00 CDMX según época; ajustar si hace falta).
- **Semanal** (`/api/cron/weekly-digest`): `email_weekly_digest`. Últimos 7 días: **top 3 por día** + más comentadas + cazadores. Lunes 00:00 UTC en `vercel.json` (ajustable).
- Plantillas: `lib/email/templates.ts` — enlaces canónicos `/oferta/[id]`.
- Autenticación cron: `CRON_SECRET` (query `secret`, header `x-cron-secret` o `Authorization: Bearer`).

## Documentación útil

- `docs/SYSTEMS/SYSTEM_voting.md` — flujo de votos.
- `docs/LAUNCH_CHECKLIST_BETA.md` — pre-lanzamiento.
- `docs/SEO_AVENTA_Y_PLAN.md` — SEO (parte histórica; el código ya usa `/oferta/[id]` y sitemap dinámico).

## Qué NO hacer sin pedirlo

- No cambiar el **diseño global** acordado (navbar, tarjetas, tono visual) salvo petición explícita.
- No exponer en UI pública datos solo de owner (paneles `/operaciones`, `/contexto`).

*Última actualización: alineado con el repo `aventa-new` (panel owner, peso de voto, métricas en `/me`).*
