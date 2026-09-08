# Day-to-Day Sources

Sección futura: ofertas útiles de retailers grandes **aunque Aventa no tenga afiliado** para esa tienda.

## Qué es

Day-to-Day es un **registro de fuentes** que entra al Hunter existente:

SOURCE → discovery → normalize → enrichment → Price Intel → dedupe → Deal Verifier → Autonomous Decision (SHADOW) → moderación → publish → **monetización**.

No es un segundo pipeline. No es un scraper.

## Source ≠ monetization

| Concepto | Pregunta | Ejemplo |
|---|---|---|
| `source` | ¿Quién descubrió la oferta? | `walmart_mx` |
| `monetizationStatus` | ¿Se puede monetizar hoy? | `non_affiliate` |

Una oferta sin afiliado **no se descarta**. Puede entrar a pending y a moderación.

Estados de monetización de una oferta:

- `affiliate` — la tienda tiene programa configurado en env
- `non_affiliate` — no hay programa (o no está configurado)
- `unknown` — URL vacía o inválida

## Lifecycle de una fuente

1. Se declara en `lib/hunter/dayToDay/registry.ts`
2. Implementa el contrato `HunterSource` (`lib/hunter/types.ts`)
3. `isConfigured() === false` → **no hay requests**
4. Cuando exista método oficial/feed/sitemap usable: `isConfigured()` pasa a true
5. `DAY_TO_DAY_<FUENTE>_ENABLED=1` enciende la fuente. **Enabled ≠ configured.**
6. El motor (`runHunterCollect`) aísla fallos y usa el circuit breaker existente
7. El candidato entra como `IngestItem` al pipeline de siempre

## Estados

| Estado | Significado |
|---|---|
| `not_configured` | Adapter existe. No hay método de discovery usable. **No es DOWN.** |
| `disabled` | Flag apagada (default) |
| `configured` | Hay método usable y credenciales si hacen falta |
| `healthy` / `degraded` / `down` | Salud de una corrida real (`hunter_source_health`) |

Cero resultados de un collect exitoso **no es un fallo** (no abre el breaker). HTTP 403/429/5xx/timeout sí lo son.

## Circuit breaker

Reutilizado de `lib/hunter/circuitBreaker.ts`:

- 3 fallos seguidos → OPEN
- 403/401 → cooldown largo
- 429 → cooldown mayor
- 5xx / timeout → cooldown medio
- half-open → una prueba

Walmart caído no tumba Chedraui. ML caído no tumba el worker.

## Límites

`DAY_TO_DAY_RATE_POLICY` en `lib/hunter/dayToDay/config.ts`:

- `maxPages`, `maxItems`, `timeoutMs`, `concurrency`, `requestsPerCycle`

Hoy `requestsPerCycle = 0`: los adapters no hacen red.

## Cómo agregar una fuente (Amazon extra, Costco, Soriana, Liverpool, Home Depot)

1. Añade el id a `HunterSourceId` e `IngestSourceId`.
2. Crea un adapter que implemente `HunterSource` (copia `createUnconfiguredRetailerSource` si aún no hay método).
3. Regístralo en `DAY_TO_DAY_SOURCES`.
4. Mapea el id en `hunterSourceForIngest`.
5. Añade `emptyIngestSourceStats()` (ya cubre las claves del tipo).
6. **No** copies ingest, verifier, shadow ni moderación.

Métodos permitidos, en este orden: API oficial → RSS/feed → sitemap → página pública permitida → fallback existente.

Prohibido: proxies, CAPTCHA bypass, evadir robots/WAF, endpoints privados no autorizados.

## Cómo activar una fuente

1. Existe un método de discovery **usable y permitido**.
2. `isConfigured()` / `isAvailable()` reflejan credenciales reales (env, nunca hardcodeadas).
3. `DAY_TO_DAY_<FUENTE>_ENABLED=1` en el entorno correspondiente.
4. Verificar `/admin/hunter` → Day-to-Day supply: deja de decir NOT CONFIGURED.
5. Un ciclo real: candidatos → pending (legacy auto-approve OFF, shadow only).

## Cómo verificar health

- Panel: `/admin/hunter` → **Day-to-Day supply**
- API: `GET /api/admin/hunter-health` → `dayToDay`
- Tabla: `hunter_source_health` (`source_id` texto; no hace falta migración)

## Qué NO hacer

- No scrapers “de prueba” en producción
- No activar fuentes para que el panel se vea lleno
- No rechazar por falta de afiliado
- No bajar umbrales del verifier
- No encender auto-publish ni legacy auto-approve
- No tocar Rewards / Commissions / ledger
