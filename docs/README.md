# Documentación AVENTA

Documentos activos en `docs/`:

| Archivo | Descripción |
|---------|-------------|
| [GUIA_AVENTA.md](./GUIA_AVENTA.md) | **Estado, roadmap y checklist** — documento único de referencia para el día a día |
| [HUNTER_INFRA_Y_ROADMAP.md](./HUNTER_INFRA_Y_ROADMAP.md) | **Hunter:** infra conectada (Vercel, Supabase, Upstash, cron-job.org, Railway) y checklist para incorporarlo a prod |
| [CRON_EXTERNO_BOT.md](./CRON_EXTERNO_BOT.md) | Cómo configurar cron-job.org → `/api/cron/bot-ingest` |
| [FEEDBACK_Y_ROADMAP.md](./FEEDBACK_Y_ROADMAP.md) | Encuestas de beta, patrón de respuestas, qué toca ahora, filtros (AVENTA vs Promodescuentos) |
| [SISTEMAS_AVENTA.md](./SISTEMAS_AVENTA.md) | Mapa de sistemas (app por partes), notificaciones, referencia a propuestas archivadas |
| [SUPABASE_CONTEXTO.md](./SUPABASE_CONTEXTO.md) | Schema public, funciones, triggers y extensiones Supabase |
| [COMO_LLEVAR_AVENTA.md](./COMO_LLEVAR_AVENTA.md) | Cómo llevar el día a día (automátizar, simplificar, menos fricción) |
| [SISTEMA_SUBIR_OFERTA.md](./SISTEMA_SUBIR_OFERTA.md) | Flujo de subir oferta (parse URL, fotos, categoría) |
| [PARSE_OFFER_MELI_LA_GALERIA.md](./PARSE_OFFER_MELI_LA_GALERIA.md) | Fix galería `meli.la` / páginas social ML (parser + mobile) |
| [README.md](./README.md) | Este índice |

Las migraciones SQL están en `docs/supabase-migrations/`.

El resto de la documentación (auditorías, avisos, checklist técnico, comparativas, métricas, limpieza, modelo de votos, moderación, roadmap de producto, etc.) está archivada en **`archived/docs/`** para mantener `docs/` limpio.
