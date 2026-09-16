# SYSTEM — Attribution Foundation

## Architecture

Cadena canónica (sin money):

```
offer_id
  → click_id (reward_outbound_clicks)
    → channel / campaign_key (server-resolved)
    → merchant network (detectNetworkFromUrl)
    → destination_url (affiliate, offers.offer_url)
    → original_destination_url (offers.original_offer_url)
    → conversion_id = null (hasta ingest real)
    → commission_id = null (hasta ledger confirmado)
```

## Source of truth boundaries

| Rol | Tabla | Contrato | Uso CEO |
|-----|-------|----------|---------|
| Volumen / behavioral outbound | `offer_events` (`event_type=outbound`) | `OUTBOUND_VOLUME_SOT` | “Volume outbound” — **no** es click_id |
| Atribución / click_id | `reward_outbound_clicks` | `OUTBOUND_ATTRIBUTION_SOT` | Persisted clicks, gap, channels |

**Nunca** sumar ambas como “clicks”.  
`cazar_cta` vive en `offer_events` (CTA card) y **no** es attribution click.  
HTTP requests ≠ filas persistidas (dedupe volumen + idempotency attribution).

Puerta única de escritura outbound: `POST /api/track-outbound`.

## Data flow

1. UI CTA → `trackAndOpenOfferUrl`
2. `POST /api/track-outbound` (offerId UUID + Bearer opcional)
3. Server valida trackable offer; identidad de user solo desde Bearer
4. Dedupe volumen → `offer_events`
5. `recordAttributedClick` → DB `offers.offer_url` (nunca body.offerUrl)
6. Idempotency key `offer+actor+ventana(10m)` UNIQUE parcial (**server-derived**; cliente no la envía)
7. Channel/campaign vía taxonomía allowlisted (`lib/attribution/channels.ts`)
8. Respuesta: `{ clickId, reused, channel, campaignKey, destinationUrl, originalDestinationUrl, conversionId: null, commissionId: null }`
9. **Reuse SoT:** si `idempotency_key` ya existe → `reused: true` y channel/campaign/destination **solo** desde la fila DB.

## Attribution Truth (CEO)

Función única: `buildAttributionTruth()` → `AttributionTruthSnapshot`.

Ventanas: `today` (UTC day), `h24`, `d7`. Top-level fields = primaria **h24** (compat bottleneck/health).

### Completeness / gap (determinístico)

`isPersistedClickAttributionComplete(row)`:

- `offer_id` presente
- `channel` allowlisted **y** ≠ `unknown`
- `destination_url` no vacía

`campaign_key` es **opcional** para complete (clicks orgánicos sin campaña son válidos); se reporta en `withCampaign`.

```
attributionGap = persistedClicks − attributionComplete
completenessPct = attributionComplete / persistedClicks × 100
```

### Conversion / commission / revenue

Siempre:

- `conversion: { connected: false, count: null, label: "not connected" }`
- `commission: { connected: false, count: null, label: "not connected" }`
- `confirmedRevenueCents: null`

**Prohibido** inferir conversión o $ desde clicks/CTR/outbound volume.

### Performance

Agregación in-memory sobre ≤ `ATTRIBUTION_TRUTH_ROW_CAP` (5000) filas de 7d.  
Si el cap se satura de forma sostenida → considerar rollups diarios (no prematuro ahora).

## Database

Migración: `docs/supabase-migrations/20260916_attribution_foundation_clicks.sql`

Columnas aditivas en `reward_outbound_clicks`:

- `channel`, `campaign_key`
- `destination_url`, `original_destination_url`
- `idempotency_key` (UNIQUE parcial)
- `attribution_meta` jsonb

## Security

- No confiar merchant/campaign/channel libres del cliente
- Campaign solo slug `[a-z0-9_-]{1,64}`
- Channel solo taxonomía `ATTRIBUTION_CHANNELS`
- URL SoT = DB
- Sin PII: solo hashes ip/ua
- CEO endpoints: auth owner/admin server-side

## Money safety

Attribution **no** escribe rewards / ledger settlements / payouts.

## Code map

| Pieza | Path |
|-------|------|
| Channels | `lib/attribution/channels.ts` |
| Identity / idempotency | `lib/attribution/clickIdentity.ts` |
| Destination pair | `lib/attribution/destination.ts` |
| Context resolve | `lib/attribution/resolveContext.ts` |
| Record click | `lib/attribution/recordAttributedClick.ts` |
| CEO truth | `lib/attribution/buildAttributionTruth.ts` |
| Legacy wrapper | `lib/rewards/attribution/clickTracking.ts` → delega |

## Tests

- `tests/attribution/attributionFoundation.test.ts` — identity, reuse SoT
- `tests/attribution/attributionTruth.test.ts` — gap, SoT boundaries, no money inference
- `tests/owner/*` — en `ci:verify`
