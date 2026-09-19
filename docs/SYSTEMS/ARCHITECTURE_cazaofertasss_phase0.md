# CAZAOFERTASSS — FASE 0 (ARQUITECTURA)

## Deal Intelligence + Affiliate Commerce Engine

Estado: **FASE 0 — contratos y dominio puro.** Sin scraping, sin publicación, sin
llamadas de red, sin migraciones, sin deploy.

Alcance de mercado: **Mercado Libre México** y **Amazon México**. Moneda única: **MXN**.

Raíz del módulo: `lib/cazaOfertas/`. Tests: `tests/cazaOfertas/`.

---

## Principio arquitectónico

CazaOfertasss es una **commercial execution layer** independiente. Aventa será
posteriormente la **consumer / community / product layer**.

Diez capas, con autoridad estrictamente separada. Ninguna capa es autoridad de otra:

| # | Capa | Archivo | Decide | NO decide |
|---|------|---------|--------|-----------|
| 1 | Discovery | `stores/adapter.ts`, `stores/*Mx.ts` | qué existe en la tienda | si el precio es real |
| 2 | Normalización | `price.ts`, `identity.ts` | número y URL canónicos | si la oferta es válida |
| 3 | Evidence | `evidence.ts` | qué podemos afirmar y con qué respaldo | cuánto vale la oferta |
| 4 | Deal validation | `evidence.ts` (`resolveDiscountClaim`) | si el descuento es sostenible | el orden de publicación |
| 5 | Scoring | `scoring.ts` | el orden entre ofertas | si la oferta es real |
| 6 | Affiliate mapping | `affiliate.ts` | si es monetizable | si es buena |
| 7 | Deduplication | `dedupe.ts` | si crea o actualiza | precios y score |
| 8 | Publication prep | `telegram/card.ts` | cómo se presenta | si se puede publicar económicamente |
| 9 | Tracking | `tracking/publication.ts` | qué se publicó y dónde | cuánto dinero entró |
| 10 | Revenue attribution | `revenue/ledger.ts` | qué reportó la red | comisiones propias o pagos |

Orquestación (no autoridad propia): `candidate.ts`.
Frontera de entrada: `validation.ts`. Aserciones estructurales: `safety.ts`.

---

## Domain model

### `DealCandidate`

Campos mínimos requeridos: `id`, `store`, `externalProductId`, `title`,
`canonicalUrl`, `affiliateUrl`, `currentPrice`, `referencePrice`, `currency`,
`discountPercent`, `category`, `seller`, `availability`, `evidence`,
`detectedAt`, `score`, `status`.

Campos de infraestructura añadidos: `identity`, `affiliate`, `firstSeenAt`,
`updatedAt`, `revision`.

`status`: `DISCOVERED | VALIDATED | REJECTED | PUBLICATION_READY | EXPIRED`.

### `DealEvidence`

Distingue explícitamente `source`, `capturedAt`, `currentPrice`,
`referencePrice`, `evidenceQuality`, `priceConfidence`, `historicalConfidence`,
más `observationWindowDays` / `observationCount` (densidad del historial) y
`couponApplied` / `promotionApplied`.

`historicalConfidence: 'page_claimed'` existe **para rechazar**, no para creer:
es el caso "la página dice 40% OFF".

### `DealScore`

`{ version, score, grade, reasons[], gatesFailed[] }`. Ocho componentes con
pesos que suman 100 (`DEAL_SCORE_WEIGHTS`), umbrales en
`DEAL_SCORE_GRADE_THRESHOLDS` (85 / 70). Sin magic numbers en el algoritmo.

### `AffiliateAttachment`

`affiliateNetwork`, `affiliateUrl`, `affiliateTrackingLabel`,
`affiliateGeneratedAt`, `affiliateCredentialRef` (nombre de env var, **nunca** el
valor).

### `AffiliateRevenueEvent`

`network`, `externalReference`, `dealId`, `trackingLabel`, `eventType`
(`CLICK | ORDER | APPROVED_ORDER | COMMISSION | REVERSAL`), `amount`,
`currency`, `occurredAt`, `status`, `reversesEventId`. Append-only, idempotente
por `network:eventType:externalReference`.

---

## Invariantes

1. **Un descuento nunca se acepta porque la página lo declare.** Sólo
   `observed_history` o `store_reference_price` son bases autoritativas.
2. **Un descuento ≥ 80 % exige historial observado**, no el precio de lista.
3. **Historial observado exige densidad**: ≥ 14 días de ventana y ≥ 5
   observaciones.
4. **Precio 0, negativo, no finito o fuera de rango es dato corrupto**, no ganga.
5. **El descuento se trunca (floor)**, nunca se redondea hacia arriba.
6. **Sin precio de referencia no se infiere descuento** (queda en 0).
7. **La moneda de la evidencia debe coincidir** con la del candidato.
8. **El precio declarado debe coincidir con el observado** en la evidencia
   (tanto actual como de referencia).
9. **Evidencia stale o con timestamp futuro no sostiene publicación** (ventana: 6 h).
10. **Identidad primaria = `store + externalProductId`**; fallback = URL canónica
    normalizada. **El título nunca es identidad.**
11. **Cambiar precio, descuento, affiliate URL o score no crea una oferta nueva**:
    `revision` avanza, `id` y `firstSeenAt` se preservan.
12. **Un retitulado no es un cambio material.**
13. **`canonicalUrl` ≠ `affiliateUrl`.** Una URL normal nunca se asume afiliada:
    debe portar los marcadores de la red (`tag` en Amazon, `matt_*` en ML).
14. **Sin elegibilidad de afiliado no hay publicación monetizada**, aunque el
    score sea excelente.
15. **Gate fallido ⇒ score 0 y grade REJECT**, sin acumular puntos por
    categoría ni vendedor.
16. **El score es determinista**: mismas entradas ⇒ mismo score, grade y
    `reasons[]` en el mismo orden.
17. **Un LLM nunca es autoridad** de precio, descuento ni score.
18. **Métricas desconocidas son `null`, nunca `0`.** No se inventan datos.
19. **Los secretos se referencian por nombre de env var** y nunca llegan al
    cliente ni a la tarjeta de Telegram.
20. **Degradación conservadora**: enum desconocido → `other` / `unknown`, nunca
    → `in_stock` / `high`.

---

## Frontera con Aventa (AVENTA BOUNDARY)

`CAZAOFERTAS_AVENTA_BOUNDARY` declara, y `tests/cazaOfertas/boundary.contract.test.ts`
verifica escaneando el módulo en disco:

- `writesAventaLedger: false`
- `writesAventaRewards: false`
- `writesAventaPayoutIntents: false`
- `writesAventaCommissions: false`
- `readsAventaEconomicTables: false`
- `settlementEnabled: false`
- `sharesEconomicTables: false`
- `integrationStyle: 'contracts_and_events_only'`

Imports prohibidos dentro de `lib/cazaOfertas/**` (`CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS`):
`lib/rewards`, `lib/economy`, `lib/commissions`, `lib/finance`, `lib/dealAlerts`,
`lib/dealIntelligence`, `lib/distribution`, `lib/supplyIntelligence`.

La única dependencia externa del módulo es `zod`. Un test lo exige.

**No hay dependencia circular**: CazaOfertasss no importa Aventa y Aventa no
importa CazaOfertasss. La integración futura será por contrato/evento.

### Código de Aventa reutilizable — dependencia documentada, NO copiada

Se identificó código adyacente que **no se copió** deliberadamente. Cada entrada
es una decisión pendiente, no un TODO de copy-paste:

| Componente de Aventa | Qué resuelve | Por qué NO se reutilizó en FASE 0 | Frontera futura |
|---|---|---|---|
| `lib/offerUrl.ts` | shortlinks ML/Amazon, tags de afiliado de plataforma | aplica tags **de Aventa** y hace I/O de red para resolver shortlinks; mezclaría identidades comerciales | extraer un `UrlCanonicalizer` puro y compartirlo por contrato |
| `lib/offers/offerUrlFingerprint.ts` | `extractAmazonAsin`, fingerprint de URL | lógica equivalente reimplementada pura dentro de `identity.ts`; reutilizar ataría CazaOfertasss al modelo `offer` de Aventa | promover a paquete compartido sin dependencias de dominio |
| `lib/dealIntelligence/**` | `PriceObservation`, `computeEffectivePrice`, capabilities | es el pipeline de **supply de Aventa**, con sus propias fronteras y versiones de schema; acoplarse crearía autoridad cruzada | consumir vía evento `deal.detected` si algún día conviene |
| `lib/hunter/supply/dealSignals.ts` | `computeDealSignals`, cutoffs de moderación | scoring orientado a moderación de comunidad, no a monetización afiliada | mantener scores separados; son objetivos distintos |
| `lib/distribution/providers/telegram/**` | envío real a Telegram Bot API | FASE 0 no publica; reutilizarlo ahora abriría el camino de envío antes de tenerlo aprobado | reutilizar el **provider** (transporte) sin importar su modelo de contenido |
| `lib/markets/**` | `MarketConfig`, redes afiliadas MX | acopla comisiones y catálogo económico de Aventa | leer sólo el catálogo de mercado, nunca las comisiones |
| `lib/affiliate/programCatalog.ts` | catálogo de programas afiliados | catálogo de la cuenta de afiliación de **Aventa** | CazaOfertasss tiene su propio registro con sus propias env vars |

---

## Escalabilidad

No implementado a propósito (explícitamente prohibido):

- `fetchAll` / `listAll` / scans globales O(N) como arquitectura principal
- scraping improvisado
- cron infinito
- LLM como autoridad
- tablas monolíticas JSONB

Diseñado para sustituir sin reescribir el dominio:

| Hoy | Mañana | Punto de sustitución |
|---|---|---|
| `createInMemoryDealCandidateRepository` | PostgreSQL | `DealCandidateRepository` (`dedupe.ts`) |
| `createInMemoryDealPublicationRepository` | PostgreSQL | `DealPublicationRepository` |
| `createInMemoryAffiliateRevenueLedger` | PostgreSQL append-only | `AffiliateRevenueLedgerPort` |
| polling | event-driven | `DealStoreAdapter.discover(query)` con `limit` + `cursor` obligatorios |
| affiliate mapping manual | automatizado | `DealStoreAdapter.createAffiliateLink` |
| publicación manual | outbox | `DealPublicationRecord.status` + `publicationIdentityKey` |

Todo listado es paginado por contrato: `discover(query)` exige `limit`, y los
repositorios exponen lookup por clave de identidad, no barridos.

---

## Seguridad

- Toda entrada externa pasa por `validation.ts` (zod). Claves desconocidas se
  descartan; un literal `__proto__` no sobrevive al parseo.
- URLs: sólo `https`, sin credenciales embebidas, longitud acotada, params de
  tracking eliminados de la identidad.
- IDs externos, etiquetas de tracking y referencias de credencial validados por
  regex cerrada.
- Montos y monedas validados; negativos, cero y no finitos rechazados.
- Secretos: sólo por nombre de env var (`affiliateCredentialIsConfigured`
  devuelve un booleano, nunca el valor).
- El título se escapa antes de entrar a la tarjeta de Telegram.

---

## Tests

`tests/cazaOfertas/` — 12 archivos, 181 casos (FASE 0 + FASE 1):

| Archivo | Cubre |
|---|---|
| `price.contract.test.ts` | normalización de precio, descuento, cero, negativos, mismatch de moneda |
| `evidence.contract.test.ts` | validación de evidencia, stale offer, autoridad de referencia, "X% OFF" |
| `scoring.contract.test.ts` | determinismo, pesos, grades, gates duros |
| `identityDedupe.contract.test.ts` | identidad canónica, normalización de URL, deduplicación |
| `affiliate.contract.test.ts` | elegibilidad, marcadores de red, tracking label, separación de URLs |
| `telegramCard.contract.test.ts` | generación de tarjeta, disclosure, disclaimer, escape |
| `trackingRevenue.contract.test.ts` | identidad de tracking, ledger idempotente, tipos de evento |
| `candidate.contract.test.ts` | input malformado, price mismatch, currency mismatch |
| `boundary.contract.test.ts` | aislamiento del módulo, frontera con Aventa, capacidades de adapters |
| `persistence.contract.test.ts` | insert/update/upsert, concurrent ×10, publication idempotency, revenue |
| `persistence.postgres.contract.test.ts` | repos Postgres contra cliente fake (A–L) |
| `persistence.staging.test.ts` | integración staging (gated por `CAZA_STAGING_PERSISTENCE=1`) |

---

## FASE 1 — Persistencia (completada)

- Tablas tipadas: `caza_deal_candidates`, `caza_publications`, `caza_revenue_events`
- Upsert atómico: RPC `caza_upsert_deal_candidate` + trigger de `revision`
- Publications: `caza_insert_publication_idempotent` (ON CONFLICT DO NOTHING)
- Revenue: append-only (triggers bloquean UPDATE/DELETE) + `caza_append_revenue_event`
- RLS: server-only (`service_role`); REVOKE de `anon`/`authenticated`
- Repos: `createPostgresDealCandidateRepository` / `Publication` / `Revenue`
- Migración: `docs/supabase-migrations/20260919_cazaofertas_persistence.sql`
  (aplicada a staging `oojshofrpbfwsiypcecr`; NO a producción)

## Siguiente frontera

1. **~~Persistencia~~** (hecha en FASE 1).
2. **Integración oficial de tienda**: credenciales aprobadas de ML API y
   Amazon PA-API; recién entonces las capacidades pasan a `supported`.
3. **Outbox de publicación**: `PREPARED → PUBLISHED` con idempotencia por
   `publicationIdentityKey` y reintentos acotados.
4. **Ingesta de reportes de red**: normalizar CSV/API de comisiones hacia
   `AffiliateRevenueEvent`, con reconciliación y reversiones.
5. **Contrato de integración con Aventa**: definir el evento público
   (`cazaofertas.deal.published`) antes de que exista cualquier consumidor.
