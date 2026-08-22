# AVENTA Hunter — infra conectada y cómo incorporarlo

Documento de decisión: qué piezas de infraestructura existen, qué hace cada una para el **Cazador (Hunter)**, y el camino concreto para dejar Hunter en producción.

> **Nota de seguridad:** no incluir en este doc IDs de proyecto (Supabase, Railway, Upstash), tokens ni URLs con `?secret=`. Esos valores viven solo en Vercel, GitHub Secrets y el gestor de contraseñas del equipo.

Hunter **no es una IA monolítica**. Son **8 módulos** que se enchufan al pipeline de ingest que ya corre en Vercel (`lib/bots/ingest/`). La UI vive en `/admin/hunter`.

---

## 1. Mapa de infraestructura (estado real)

| Pieza | Rol para Hunter | Estado |
|-------|-----------------|--------|
| **Vercel** (repo `aventa-new`) | Corre el cerebro del bot: recolector API, Price Engine, scorer, publisher | **Activo** · [aventaofertas.com](https://aventaofertas.com) |
| **Supabase** (proyecto prod) | Ofertas, moderación, `app_config`, snapshots de precio ML | Ver dashboard Supabase |
| **Supabase** (proyecto legacy) | Proyecto antiguo / paralelo | **No usar para Hunter** |
| **Upstash Redis** | Rate limit + cache de feed (no es el bot) | Variables `UPSTASH_REDIS_REST_*` en Vercel |
| **Cron externo** (p. ej. cron-job.org) | Despierta cada ~15 min `GET /api/cron/bot-ingest` con `CRON_SECRET` | Configurar en el panel del proveedor |
| **Railway** · `workers/mercadolibre-worker` | Playwright → `POST /api/cron/bot-ingest-candidates` | Opcional; ver README del worker |
| **Resend** | Digests / alertas (no es el ciclo Hunter) | Variables en Vercel |
| **Afiliados ML / Amazon** | Tags al publicar | Variables en Vercel |

Catálogo en código: `lib/owner/infrastructureCatalog.ts`.  
Cron externo paso a paso: `docs/CRON_EXTERNO_BOT.md`.  
Worker Playwright: `workers/mercadolibre-worker/README.md`.

### Dos caminos del bot (no confundirlos)

```text
Camino A (vivo) — API dentro de Vercel
  cron externo ──GET──► /api/cron/bot-ingest
                         └── discover ML (API pública) + score + insert

Camino B (opcional) — scrapeo fuera de Vercel
  Worker Playwright ──POST──► /api/cron/bot-ingest-candidates
                                └── solo candidatos; AVENTA scorea e inserta
```

Hunter se incorpora sobre **Camino A**. Railway es un recolector extra, no el “cerebro”.

---

## 2. Los 8 módulos y cómo encajan en la infra

Registro vivo: `lib/hunter/modules.ts`.

| # | Módulo | Estado código | Dónde corre | Dependencia infra |
|---|--------|---------------|-------------|-------------------|
| 1 | **Recolector** | live | Vercel (`collectIngestItems` / `discoverMercadoLibre`) | Cron externo + `BOT_INGEST_DISCOVER_ML=1` (+ worker Playwright opcional) |
| 2 | **Price Engine** | live (ML) | Vercel (`mlPriceEngine.ts`) | Tabla `product_price_snapshots` en Supabase (service_role) |
| 3 | **Coupon Hunter** | planned | — | No tocar aún |
| 4 | **Bank Hunter** | planned | — | No tocar aún |
| 5 | **Deal Scorer** | live | Vercel | Señales de Price Engine + quality |
| 6 | **Copy Agent** | partial | Vercel | Sin proveedor LLM obligatorio hoy |
| 7 | **Affiliate Engine** | live | Vercel | Tags ML/Amazon en env |
| 8 | **Publisher** | live | Vercel | Supabase `offers` + cola de moderación |

**Upstash no forma parte del ciclo Hunter.** Solo protege APIs y cachea el feed público.

---

## 3. Qué ya está listo vs qué falta subir

### Ya en producción (app desplegada + env)

- Interruptor owner: `/admin/operaciones/trabajo` → `app_config.bot_ingest_paused`
- Endpoint: `/api/cron/bot-ingest` (+ run-now admin)
- `BOT_INGEST_ENABLED=1`, `BOT_INGEST_DISCOVER_ML=1` (tras redeploy)
- `CRON_SECRET` + job en cron externo
- Crons Vercel diarios (digest / integridad / health) — **sin** bot cada 15 min (Hobby)

### En repo (verificar en prod tras deploy)

- UI `/admin/hunter` + nav owner/admin
- Price Engine ML (`mlPriceEngine.ts`, `mlPricesApi.ts`)
- Scorer con descuento efectivo / vs habitual
- Migración SQL: `docs/supabase-migrations/product_price_snapshots.sql`

### No hace falta para el primer Hunter “vivo”

- Railway / Playwright
- `BOT_INGEST_EXTERNAL_WORKER=1`
- Keepa (Amazon) — opcional y aparte
- Coupon / Bank Hunter
- LLM para copy

---

## 4. Cómo logramos incorporar Hunter (checklist)

Objetivo: el owner abre `/admin/hunter`, ve módulos live, dispara un ciclo y el cron externo alimenta la cola cada ~15 min con Price Engine ML acumulando historial.

### Paso 1 — Código en producción

1. Commit + push a `master`.
2. Esperar deploy Vercel Ready en [aventaofertas.com](https://aventaofertas.com).
3. Verificar que `/admin/hunter` responde (solo owner, mismo gate que technical).

### Paso 2 — Confirmar interruptor y fuentes

1. `/admin/operaciones/trabajo` → **Permitir ejecución del bot** marcado.
2. En Vercel Production:
   - `BOT_INGEST_ENABLED=1`
   - `BOT_INGEST_DISCOVER_ML=1`
   - usuarios bot (`BOT_INGEST_USER_ID_TECH` / `_STAPLES` o equivalente)
   - `BOT_INGEST_AUTO_APPROVE` según política (hoy `0` = todo a moderación)
3. No hace falta `BOT_INGEST_EXTERNAL_WORKER` si no usas Railway.

### Paso 3 — Despertador 24/7

1. Mantener cron externo cada ~15 min a `/api/cron/bot-ingest` con header `Authorization: Bearer CRON_SECRET` (preferido) o el método documentado en `docs/CRON_EXTERNO_BOT.md`.
2. Historial del cron: HTTP 202 = OK (la ingesta sigue en `after()`).
3. Logs Vercel: buscar `[bot-ingest:after]`.

### Paso 4 — Price Engine ML madura solo

1. Cada corrida guarda snapshot diario por `product_id` en `product_price_snapshots`.
2. Hacen falta **≥ ~4 días** de historial por producto antes de confiar en “mínimo histórico” / descuento efectivo.
3. Hasta entonces el scorer puede ser más conservador; no es un fallo de infra.

### Paso 5 — Operar desde Hunter

1. Panel: `/admin/hunter` (Explorar ahora + estado de módulos).
2. Ofertas → cola de moderación (mientras `AUTO_APPROVE=0`).
3. KPI: pending, insertadas hoy, fuentes ML activas.

### Paso 6 — Decisión Railway (opcional)

| Opción | Cuándo |
|--------|--------|
| **Apagar / no renovar Railway** | Bastan candidatos por API ML (recomendado al arrancar Hunter) |
| **Renovar + cron cada 15 min** | Solo si Playwright captura deals que la API no ve |
| Si lo reactivas | Pon `BOT_INGEST_EXTERNAL_WORKER=1` en Vercel y alinea `AVENTA_CRON_SECRET` = `CRON_SECRET` |

No pagar dos recolectores solapados “por si acaso”.

---

## 5. Variables Vercel que importan a Hunter

| Variable | Rol |
|----------|-----|
| `BOT_INGEST_ENABLED` | Master switch de código |
| `BOT_INGEST_DISCOVER_ML` | Fuente ML vía API |
| `BOT_INGEST_USER_ID_*` | Quién “caza” en DB |
| `BOT_INGEST_AUTO_APPROVE` / scores | Cola vs auto-publish |
| `BOT_INGEST_DAILY_MAX` / `MAX_PER_RUN` | Cupos |
| `CRON_SECRET` | Cron externo + run-now interno |
| `UPSTASH_REDIS_REST_*` | No Hunter; sí protección del sitio |
| `BOT_INGEST_EXTERNAL_WORKER` | Solo si worker Playwright está vivo |
| `BOT_INGEST_KEEPA_ENABLED` | Amazon price intel (aparte de ML) |

Lista completa de flags: panel Trabajo / `GET /api/admin/bot-ingest-status`.

---

## 6. Bloqueo real de Mercado Libre (por qué Explorar ahora da 0)

La API pública `api.mercadolibre.com` (search e items) responde **403 PolicyAgent** desde IPs de cloud (Vercel y muchos VPS). El ciclo puede devolver HTTP 200 con `inserted: 0` y `ml_api.collected: 0`.

Por eso existe **Camino B**: `workers/mercadolibre-worker` (Playwright) → `POST /api/cron/bot-ingest-candidates`.

Mitigaciones:

1. Worker Playwright en cron (GitHub Actions cada 30 min o Railway si lo renuevas).
2. Otra máquina con IP residencial apuntando al mismo endpoint.
3. No esperar que el cron externo solucione el 403: solo llama a Vercel.

---

## 7. Qué no hacer todavía

- No empezar Coupon Hunter ni Bank Hunter hasta que Price Engine ML lleve días de snapshots y el ciclo A esté estable.
- No meter un LLM genérico como “el bot”; el copy solo limpia título.
- No volver a meter `bot-ingest` en `vercel.json` en plan Hobby (rompe el límite de 1 cron/día por job).
- No mezclar credenciales del proyecto Supabase legacy.

---

## 8. Criterio de “Hunter incorporado”

Se considera listo cuando:

1. `/admin/hunter` en prod muestra Recolector + Price + Scorer + Affiliate + Publisher en **live**.
2. Cron externo sigue en **Éxito** (2xx) cada ~15 min.
3. Logs muestran corridas con `inserted` / candidatos ML.
4. `product_price_snapshots` crece día a día.
5. El owner modera desde la cola sin depender del worker Playwright.

Cuando eso esté verde, el siguiente módulo a diseñar (bajo pedido explícito) es **Coupon / Bank Hunter** — no antes.
