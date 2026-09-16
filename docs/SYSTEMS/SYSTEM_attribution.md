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

**Fuentes de verdad (dual, intencional):**

| Rol | Tabla | Contrato |
|-----|-------|----------|
| Volumen / CEO CTR | `offer_events` (`outbound`) | `OUTBOUND_VOLUME_SOT` |
| Atribución / click_id | `reward_outbound_clicks` | `OUTBOUND_ATTRIBUTION_SOT` |

Puerta única de escritura outbound: `POST /api/track-outbound`.

## Data flow

1. UI CTA → `trackAndOpenOfferUrl`
2. `POST /api/track-outbound` (offerId UUID + Bearer opcional)
3. Server valida trackable offer; identidad de user solo desde Bearer
4. Dedupe volumen → `offer_events`
5. `recordAttributedClick` → DB `offers.offer_url` (nunca body.offerUrl)
6. Idempotency key `offer+actor+ventana(10m)` UNIQUE parcial
7. Channel/campaign vía taxonomía allowlisted (`lib/attribution/channels.ts`)
8. Respuesta: `{ clickId, channel, campaignKey, conversionId: null, commissionId: null }`

## Database

Migración: `docs/supabase-migrations/20260916_attribution_foundation_clicks.sql`

Columnas aditivas en `reward_outbound_clicks`:

- `channel`, `campaign_key`
- `destination_url`, `original_destination_url`
- `idempotency_key` (UNIQUE parcial)
- `attribution_meta` jsonb

**No** crea tablas campaigns/channels/merchants (taxonomía en código hasta que el producto las necesite).

## Security

- No confiar merchant/campaign/channel libres del cliente
- Campaign solo slug `[a-z0-9_-]{1,64}`
- Channel solo taxonomía `ATTRIBUTION_CHANNELS`
- URL SoT = DB
- Sin PII: solo hashes ip/ua

## Money safety

Attribution **no** escribe:

- `creator_rewards`
- `affiliate_ledger_entries` settlements
- payouts

`conversionId` / `commissionId` permanecen null hasta ingest de red + money path descongelado.

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

`tests/attribution/attributionFoundation.test.ts`
