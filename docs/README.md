# Documentación AVENTA

## Source of Truth

| Archivo | Descripción |
|---------|-------------|
| **[AVENTA_SOURCE_OF_TRUTH.md](./AVENTA_SOURCE_OF_TRUTH.md)** | **Canónico.** Estado REAL de sistemas, supply, moderación, money, autonomía y drift documental. Código/producción prevalecen sobre el resto de docs. |

Documentos activos en `docs/` (secundarios; si contradicen el SoT, gana el SoT):

| Archivo | Descripción |
|---------|-------------|
| [GUIA_AVENTA.md](./GUIA_AVENTA.md) | Estado, roadmap y checklist del día a día (puede estar desfasado vs SoT) |
| [hunter/supply-orchestration.md](./hunter/supply-orchestration.md) | Supply Router / Truth (alineado con código FASE 10) |
| [hunter/day-to-day-sources.md](./hunter/day-to-day-sources.md) | Fuentes Día a Día y flags |
| [HUNTER_INFRA_Y_ROADMAP.md](./HUNTER_INFRA_Y_ROADMAP.md) | Hunter infra histórica — **parcialmente obsoleta** (GHA worker es el camino real; ver SoT) |
| [CRON_EXTERNO_BOT.md](./CRON_EXTERNO_BOT.md) | Cómo configurar cron-job.org → `/api/cron/bot-ingest` |
| [FEEDBACK_Y_ROADMAP.md](./FEEDBACK_Y_ROADMAP.md) | Encuestas de beta, patrón de respuestas, qué toca ahora, filtros (AVENTA vs Promodescuentos) |
| [SISTEMAS_AVENTA.md](./SISTEMAS_AVENTA.md) | Mapa de sistemas (app por partes), notificaciones, referencia a propuestas archivadas |
| [SUPABASE_CONTEXTO.md](./SUPABASE_CONTEXTO.md) | Schema public, funciones, triggers y extensiones Supabase |
| [COMO_LLEVAR_AVENTA.md](./COMO_LLEVAR_AVENTA.md) | Cómo llevar el día a día (automátizar, simplificar, menos fricción) |
| [SISTEMA_SUBIR_OFERTA.md](./SISTEMA_SUBIR_OFERTA.md) | Flujo de subir oferta (parse URL, fotos, categoría) |
| [PARSE_OFFER_MELI_LA_GALERIA.md](./PARSE_OFFER_MELI_LA_GALERIA.md) | Fix galería `meli.la` / páginas social ML (parser + mobile) |
| [SYSTEMS/SYSTEM_mercadolibre_affiliate.md](./SYSTEMS/SYSTEM_mercadolibre_affiliate.md) | ML Afiliados: capability matrix + fail-closed ingest |
| [SYSTEMS/SYSTEM_economy.md](./SYSTEMS/SYSTEM_economy.md) | Economy: adapter, revisions, reconciliation (sin settlement) |
| [SYSTEMS/SYSTEM_conversion_commission.md](./SYSTEMS/SYSTEM_conversion_commission.md) | Detalle Conversion + Commission (alias de economy) |
| [README.md](./README.md) | Este índice |

Las migraciones SQL están en `docs/supabase-migrations/`.

El resto de la documentación (auditorías, avisos, checklist técnico, comparativas, métricas, limpieza, modelo de votos, moderación, roadmap de producto, etc.) está archivada en **`archived/docs/`** para mantener `docs/` limpio.
