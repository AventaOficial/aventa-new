# CONTRACT — Focus Queue filters (diseño, no implementado)

**Fecha:** 2026-09-16  
**P0.4 FASE 7:** solo contrato. **NO** construir panel lateral ni segunda cola.

## Autoridad

`POST /api/admin/moderation/claim-next` → `claimNextModerationOffer` sigue siendo la única autoridad de claim.

## Extensión propuesta (futuro)

Body opcional adicional (hints, no bypass de lease):

```ts
type ClaimNextFilterHints = {
  /** Preferencia de orden, no exclusión dura salvo IDs explícitos. */
  preferPriority?: 'P1' | 'P2' | 'P3' | 'P4';
  preferMerchant?: string | null;   // store normalize
  preferSourceTab?: 'all' | 'bot' | 'users'; // ya existe sourceTab
  minDiscountPercent?: number | null; // derivado price/original
  maxAgeHours?: number | null;
  brandContains?: string | null; // title/store — cuidado: no LIKE abierto en prod sin índice
};
```

## Reglas

1. Los filtros solo reordenan / recortan el set elegible **dentro** del hard cap 1000.
2. Lock + exclude de sesión + maxLevel siguen aplicando.
3. UI: chips ligeros encima de Focus — **no** lista paralela de ofertas.
4. Reutilizar `sortPendingOffersForModeration` / `evaluateModerationPriority` existentes.

## Infra parcial existente

- `sourceTab` bot|users|all — ya en claim-next
- Priority sort + SLA breach — ya en sortPendingOffers
- Pending health panels — lectura, no claim

## Fuera de alcance hasta P0 dedicado

Panel lateral multi-item, cursors OFFSET, segunda RPC de claim.
