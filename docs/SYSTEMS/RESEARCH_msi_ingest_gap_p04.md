# RESEARCH — MSI ingest gap (P0.4)

**Status:** UNKNOWN extraction — no inventar scraping.

## Pipeline confirmado

```
SOURCE (ML / HTML / worker)
  → ParsedOfferMetadata          ← NO tiene campo MSI
  → insertIngestedOffer payload  ← NO escribe msi_months
  → offers.msi_months            ← solo community POST + update-offer
```

## Dónde se pierde

1. **Parser:** `lib/bots/ingest/fetchParsedOfferMetadata.ts` — `ParsedOfferMetadata` no declara installments/MSI.
2. **Discover / resolve ML:** sin matches de installment/MSI en worker o discover.
3. **Insert bot:** `lib/bots/ingest/insertIngestedOffer.ts` no incluye `msi_months` en el payload.

## Dónde SÍ se escribe hoy

- Community: `app/api/offers/route.ts` + ActionBar
- Moderación: `PATCH /api/admin/update-offer` + FixSheet

## Próximo punto de incorporación (cuando haya evidencia de fuente)

1. Extraer installments del JSON/HTML ML (candidatos: discover / item resolve / PDP evidence).
2. Extender `ParsedOfferMetadata`.
3. Mapear en `insertIngestedOffer` → `msi_months` (1–24 vía `parseOfferEditMsiMonths` / `isValidMsiMonths`).

**P0.4:** no se implementó extracción. Moderador puede corregir MSI manualmente en Focus.
