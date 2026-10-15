# Plan de limpieza QA staging (reversible, sin ejecutar)

**Proyecto:** `oojshofrpbfwsiypcecr` únicamente.  
**Inventario fuente:** `qa-inventory-session.json` (generado por `build-qa-inventory.mjs`).  
**Regla:** cada `DELETE` va precedido de `SELECT` que demuestre propiedad inequívoca (ID en lista cerrada + marcador de sesión).

## Exclusiones obligatorias (NO borrar)

Usar los IDs en `sharedFixtureWarning` del inventario local (oferta, creador y clicker reutilizados por canarios M5.x). Esos registros **no** pertenecen a una sola ejecución QA y no deben borrarse por error.

| Recurso | Fuente en inventario |
|---------|----------------------|
| Oferta fixture compartida | `sharedFixtureWarning.offerId` |
| Perfil creador fixture | `sharedFixtureWarning.creatorId` |
| Clicker fixture reutilizado | `sharedFixtureWarning.clickerId` |

## Bloqueos de propiedad

- **Clicks (`reward_outbound_clicks`):** no inventariados por IP (hash en DB). Resolver solo vía `affiliate_conversions.click_id` de conversiones con `external_conversion_id` en listas por stamp (ver inventario).
- **`payout_intents.provider_reference`:** columna no expuesta en PostgREST; usar IDs de intent del informe M5.x y `meta->>'provider_reference'` en verificación previa.
- **Rewards/intents históricos:** IDs en informes pueden solaparse con corridas anteriores si el UUID coincide; antes de borrar, exigir cadena `commission.external_commission_id` ∈ lista de stamp de **esta** sesión.

## Orden de dependencias (hijos → padres)

1. `reward_clawback_adjustments` WHERE `reward_id` ∈ `ownedRewardIds`
2. `reward_audit_log` WHERE `entity_id` ∈ (`ownedIntentIds` ∪ `ownedRewardIds` ∪ audit manual)
3. `payout_intents` WHERE `id` ∈ `ownedIntentIds` (verificar `reward_id` ∈ `ownedRewardIds`)
4. `creator_rewards` WHERE `id` ∈ `ownedRewardIds`
5. `affiliate_ledger_entries` WHERE `id` ∈ ledgerIds del inventario `economyChain`
6. `affiliate_commissions` WHERE `id` ∈ `economyChain.commissionIdsSessionScoped`
7. `affiliate_conversions` WHERE `id` ∈ `economyChain.conversionIdsSessionScoped`
8. `reward_outbound_clicks` WHERE `id` = `conversion.click_id` (solo tras paso 7)
9. **Manual QA:** `offer_votes` WHERE `offer_id` ∈ `stagingManualQa.offerIds` → `offers` WHERE `id` ∈ la misma lista y título coincide con el `RUN_ID` en `stagingManualQa.runIds`
10. Usuario Auth creado por `stagingManualQa` (patrón `qa-rewards-<RUN_ID>@…` en el test); puede ya no existir si `afterAll` lo eliminó

## Verificación previa (plantilla por tabla)

```sql
-- Ejemplo: comisión de canario M5.4 (sustituir UUID y stamp desde inventario)
SELECT id, external_commission_id FROM affiliate_commissions
WHERE id = '<uuid-from-inventory>'
  AND external_commission_id LIKE 'm54-comm-%<stamp-from-session.canaries>%';
```

Solo si la fila devuelve exactamente una fila con el patrón de stamp de la sesión → candidata a borrado.

## Reversibilidad

Antes de cualquier borrado futuro: exportar JSON por tabla para los IDs del inventario (`pg_dump --data-only` o script de snapshot). Guardar en `scripts/_rewards_staging_reports/snapshots/<fecha>/`.

## Resumen de cantidades

Consultar `qa-inventory-session.json` (local, no versionado):

- Conteos por stamp en `stampScopedRows` y listas en `economyChain`.
- `ownedReportIds`, `tablesFromReportIds`, `stagingManualQaDetail`.
- Ledger `staging_qa` del script verify en `verifyScriptLedgerQa`.
