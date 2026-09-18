# Day-to-Day Sources

Ofertas útiles de retailers grandes **aunque Aventa no tenga afiliado**.

## Pipeline

SOURCE → discovery → normalize → enrichment → Price Intel → **Deal Qualification** → dedupe → Deal Verifier → Autonomous (SHADOW) → pending → moderation → publish → monetization.

No hay segundo pipeline.

Deal Qualification produce **evidencia** (¿es una oferta?).  
Deal Verifier conserva autoridad sobre AUTO_APPROVE / HUMAN_REVIEW / AUTO_REJECT.  
Autonomous sigue siendo otro universo: `NO_VERIFIED_DEAL` **no** es AUTO_REJECT.

## Source ≠ monetization

| Concepto | Pregunta | Ejemplo |
|---|---|---|
| `source` | ¿Quién descubrió? | `chedraui_mx` |
| `monetizationStatus` | ¿Se puede monetizar hoy? | `non_affiliate` |

Sin afiliado **no se descarta**.

## Fuentes piloto (FASE 8)

| Fuente | Compliance | Discovery | Default |
|---|---|---|---|
| Chedraui | READY (adapter) / listings CATALOG_ONLY | ItemList `/promociones/*` + sitemap slug promo | NOT_CONFIGURED / OFF |
| Bodega Aurrera | DEGRADED | sitemap/PDP attempt; challenge | NOT_CONFIGURED / OFF |
| Walmart MX | DEGRADED | sitemap/PDP attempt; anti-bot | NOT_CONFIGURED / OFF |

### Futuras

| Fuente | Estado |
|---|---|
| Liverpool | NOT_CONFIGURED — candidato FASE 8.1 |
| Home Depot | NOT_CONFIGURED / CATALOG_ONLY — FASE 9.1 sin adapter |
| Soriana | **BLOCKED_PENDING_POLICY_REVIEW** (términos vs spiders/robots) |

## Evidencia de cumplimiento (auditoría)

### Chedraui
- `robots.txt`: User-agent `*` con muchos `Disallow` de categorías; **no** bloquea `/…/p` ni sitemaps `product-*`.
- Promo listing (`/promociones-exclusivas`): SPA/VTEX shell sin productos en HTML.
- Colecciones `/promociones/nuestras-marcas` y `/promociones/perecederos`: ItemList JSON-LD público; **catálogo**, no strike-through.
- `AggregateOffer` high/low es rango, no precio tachado.
- PDP pública: JSON-LD `Product` con `name`, `image`, `offers.price`, `sku/mpn`.
- Método: **superficies configuradas** (ItemList permitido + sitemap filtrado) → PDP JSON-LD si hace falta. Sin APIs privadas VTEX.

### Bodega / Walmart
- `robots.txt`: Disallow cart/checkout/search/account; Sitemap público.
- `/content/ofertas`: shell Next.js sin productos.
- PDPs vía sitemap: **challenge / 404** observados — **no** se evade CAPTCHA ni WAF.
- Adapter reporta `403` + message seguro y abre circuit breaker.

## Flags (fail-closed)

```
DAY_TO_DAY_CHEDRAUI_ENABLED=1
DAY_TO_DAY_CHEDRAUI_DISCOVERY=1
DAY_TO_DAY_BODEGA_ENABLED=1
DAY_TO_DAY_BODEGA_DISCOVERY=1
DAY_TO_DAY_WALMART_ENABLED=1
DAY_TO_DAY_WALMART_DISCOVERY=1
DAY_TO_DAY_PILOT=true
DAY_TO_DAY_FIXTURES=1
```

| Flag | Efecto |
|---|---|
| `*_ENABLED` | `isEnabled` |
| `*_DISCOVERY` | `isConfigured` / permite collect |
| `DAY_TO_DAY_PILOT` | recorta maxItems/requests |
| `DAY_TO_DAY_FIXTURES` | usa fixtures locales (cero red) |

**Producción:** dejar todas en OFF. Enabled ≠ configured.

También respeta `BOT_INGEST_ENABLED` vía el ciclo Hunter existente.

## Rate limits

`DAY_TO_DAY_RATE_POLICY` / pilot:

- maxPages ≤ 2 (1 en pilot)
- maxItems ≤ 12 (8 en pilot)
- requestsPerCycle ≤ 8 (5 en pilot)
- timeout 12s (`HUNTER_HTTP_TIMEOUT_MS`)
- concurrency 1

## Health

- zero results → **healthy** (no abre breaker)
- 403 / challenge / 429 / timeout / 5xx → **failure**
- Walmart caído no tumba Chedraui

Panel: `/admin/hunter` → Day-to-Day supply  
API: `GET /api/admin/hunter-health` → `dayToDay`

## Cómo agregar una fuente

1. Id en `HunterSourceId` + `IngestSourceId`
2. Fila en `capabilityMatrix.ts`
3. `createRetailerSource({...})` + registro en `adapters.ts` / `registry.ts`
4. Fixture sanitizado en `tests/fixtures/dayToDay/`
5. **No** copiar ingest/verifier/shadow

Métodos permitidos: API oficial → feed/sitemap → página pública permitida.  
Prohibido: proxies, CAPTCHA bypass, endpoints privados, evadir robots/WAF.

## Deal Qualification (FASE 8.1)

Pregunta: ¿hay evidencia suficiente para presentarlo como oferta?

| Clase | Significado | Pipeline |
|---|---|---|
| `VERIFIED_DEAL` | Precio actual + original explícito, o descuento/ahorro explícito | Continúa |
| `PROMOTION` | 2x1 / 3x2 / combo / cupón / liquidación / precio especial ligado al PDP | Continúa |
| `POTENTIAL_DEAL` | Señal incompleta o no ligada al producto | Continúa (revisión humana) |
| `NO_VERIFIED_DEAL` | Catálogo sin evidencia | Skip (`catalog_only` / `missing_discount_evidence`) |

No se inventa `originalPrice` ni `%`. Un `%` derivado de un par explícito queda con provenance `derived`. Price Intel **no** puede fabricar `VERIFIED_DEAL`.

Jerarquía: source explicit > trusted enrichment > price intel > unknown.

Métricas (universo propio, no shadow): `GET /api/admin/hunter-health` → `dealQualification`. Panel `/admin/hunter` sección Day-to-Day.

## Superficies Chedraui (FASE 8.2)

FASE 8.1 demostró que el sitemap genérico entrega **catálogo**. Esta fase descubre superficies de promoción sin activar flags ni crawl masivo.

Configuración por superficie (`spec.surfaces`), no `if/else` por URL.

### Matriz

| Superficie | Tipo | Robots | Status | Cableada |
|---|---|---|---|---|
| `/promociones/nuestras-marcas` | ItemList JSON-LD | permitido | **CATALOG_ONLY** | sí |
| `/promociones/perecederos` | ItemList + AggregateOffer | permitido | **CATALOG_ONLY** | sí |
| sitemap `product-0` slug `-2x1-` / `2x1-gratis` / `-3x2-` | sitemap → PDP | permitido | **DEGRADED** (yield bajo) | sí |
| `/promociones/jabones` | ItemList | permitido | **CATALOG_ONLY** | no (budget) |
| `/promociones-exclusivas` | SPA hub | permitido | **DEGRADED** | no |
| landings `3x2-*` | SPA, ItemList vacío | permitido | **DEGRADED** | no |
| `/super-extra` | marca de arroz | permitido | **CATALOG_ONLY** | no |
| `/cupon/cereal` | ItemList; cupón de categoría | permitido | **CATALOG_ONLY** | no |
| `/search?*` | búsqueda | **Disallow** | **BLOCKED_PENDING_POLICY_REVIEW** | no |
| `/Despensa/` y otras categorías | listing | **Disallow** | **BLOCKED_PENDING_POLICY_REVIEW** | no |

Ninguna superficie listing se declara **READY**: el nombre “promociones” no es evidencia de oferta.

### Evidencia

- `robots.txt` User-agent `*`: muchas categorías Disallow. **Permitido:** `/promociones/…`, `/promociones-exclusivas`, `/super-extra`, PDPs `/p`, sitemaps `product-*`. Sin `Crawl-delay`.
- ItemList en colecciones `/promociones/*` es parseable (JSON-LD `itemListElement`).
- `AggregateOffer.highPrice` **no** es `originalPrice`. En perecederos, low/high es rango (100 g vs kg). Usarlo fabricaría `VERIFIED_DEAL` falso.
- Landings `3x2-*` y “N% descuento”: robots-ok, productos no ligados al %/3x2 del slug → `promotion_not_product_bound` si se heredara; **no se hereda**.
- Type B real: PDP cuyo **título** contiene `2x1` (p. ej. té Doblett). El slug de campaña del sitio no se copia a cada SKU.
- Imágenes: `isValidOfferImage` / `mergeTrusted`. Banners, logos y similares se descartan.

### Tipo A vs Tipo B

| Tipo | Evidencia | Clase |
|---|---|---|
| A — price discount | `originalPrice` + `currentPrice` o descuento/ahorro explícito | `VERIFIED_DEAL` |
| B — promotion | 2x1 / 3x2 / combo / cupón / liquidación **ligado al producto** | `PROMOTION` |

No convertir una promo no-precio en `discountPercent`.

### Paginación

`listingPageUrl` añade `?page=N`. Pilot/maxPages = 1. No se hace crawl completo. Canonical = pathname del PDP. Duplicados por URL/SKU se colapsan en el parser.

### Métricas `surfaceDiscovery`

Universo propio (process memory). Por superficie: requests, candidates, products, verifiedDeals, promotions, catalogOnly, errors, latency, evidenceQuality, productBindingSuccess.

**No** mezclar con `autonomousPct` ni con source health.

API: `GET /api/admin/hunter-health` → `surfaceDiscovery`.

### Primer candidato futuro (no activar ahora)

`sitemap_promo_slug` (Type B por slug de PDP) **si** el yield deja de ser ~0. Mientras tanto, ninguna superficie cumple READY.

## Retailer Discovery Framework (FASE 9)

Proceso reusable: robots → surface → compliance → evidence → binding → qualification → score.

`discoverRetailer(profile)` **no inserta** y no escribe source health.

Universo `retailerDiscovery` (process memory). Distinto de `surfaceDiscovery`, qualification y autonomousPct.

API: `GET /api/admin/hunter-health` → `retailerDiscovery`. Panel: `/admin/hunter` → Retailer Discovery Matrix.

READY no se auto-asigna. Un hit promocional no abre un canal.

Presupuesto: maxRequests 8, maxPages 1, maxCandidates 10, concurrency 1. Respeta Crawl-delay.

## Home Depot sitemap channel (FASE 9.1)

Investigación **sin adapter** y sin activación. Hipótesis: sitemap → PDP → JSON-LD → Deal Qualification.

### Robots

`https://www.homedepot.com.mx/robots.txt`: User-agent `*`, sin `Disallow`, sin `Allow` explícito, sin `Crawl-delay`. Sitemap: `https://www.homedepot.com.mx/sitemap_10351.xml`. De facto `allow_broad`. No se tocó search/cart/checkout/login.

### Sitemaps

Índice (6 hijos):

- `sitemap_10351_1.xml.gz` … `_5.xml.gz` (shards de producto `/p/`)
- `sitemap-landings.xml` (marcas/ayuda/newsroom — **no** PDPs, **no** promotion sitemap)

No existe sitemap `promo` / `oferta` / `sale`.

Presupuesto real: 8 requests = robots + index + 1 shard + 5 PDPs. Concurrency 1.

### Pilot (no persistente)

Shard 1: ~10 000 locs `/p/`. `promoSlugHits` = 2 (`maceta-2x1-viena-…`, `maceta-2x1-florencia-…`). Esos slugs redirigen a canonical **sin** 2x1. Título y JSON-LD sin promoción. Precio actual explícito; `originalPrice` ausente.

5/5 PDPs: `NO_VERIFIED_DEAL` / catalog_only. evidenceYield = 0. productBinding 100%. Imágenes de producto válidas. 0 challenge, 0 errores.

### Clasificación

- Canal de **catálogo** vía sitemap: sí (sostenible para productos, no para deals).
- Canal de **deals**: **NO_SUSTAINABLE_DISCOVERY_CHANNEL**
- Veredicto: **CATALOG_ONLY**
- PROMISING no aplica (0 VERIFIED_DEAL, 0 PROMOTION)
- READY no aplica

No crear adapter. No activar Home Depot.

Universo de métricas: `sitemapChannelDiscovery` (report de script). No mezclar con source health, qualification counters ni autonomousPct.

## Supply Orchestration (FASE 10)

Capa `lib/hunter/supply/`: registry + router. Community first-class. Contrato canónico = `IngestItem`.

No activa retailers. No publica. Ver `docs/hunter/supply-orchestration.md`.

## Cómo desactivar

Quitar `*_ENABLED` y/ o `*_DISCOVERY`, o apagar `BOT_INGEST_ENABLED`.

## Qué NO hacer

- No scrapers agresivos / crawl masivo
- No activar en producción sin validación real
- No rechazar por falta de afiliado
- No bajar thresholds del verifier
- No auto-publish / legacy auto-approve
- No tocar Rewards / Commissions / ledger
