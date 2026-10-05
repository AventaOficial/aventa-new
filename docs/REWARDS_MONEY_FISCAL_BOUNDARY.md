# Rewards, Money y Fiscal — fronteras de arquitectura

Estado: **Money congelado** (`MONEY_PATH_FROZEN`, fail-closed en producción) y **Rewards apagado** (`REWARDS_PROGRAM_ACTIVE` ausente).
Este documento describe cómo se relacionan las capas, sin activar nada. Ninguna sección implica una migración.

## A. Rewards

### Las cinco capas

| Capa | Qué es | Qué NO es | Fuente de verdad |
|---|---|---|---|
| XP (logros) | Progresión de juego por hitos | Dinero; no entra en reputación | `lib/achievements/catalog.ts`, `profiles.achievement_xp` (RPC `grant_achievement_xp`) |
| Reputación | Confianza y autoridad (niveles 1–4) | Dinero | SQL `recalculate_user_reputation`, `lib/reputation.ts`, `lib/votes/reputationWeights.ts` |
| Reward | Beneficio económico **potencial** por una compra atribuida | Dinero disponible | `creator_rewards` (estados `PENDING`/`VALIDATING`) vía `lib/rewards/rewardsEngine.ts` |
| Available balance | Reward que superó validación y retención | Dinero pagado | `creator_rewards` en `AVAILABLE`; `getUserRewardBalances` |
| Payout | Intento de liquidar dinero al usuario | Garantía de pago | `payout_intents`, `reward_payouts`, `lib/rewards/payoutIntent/*`, `lib/rewards/payout.ts` |

Combinación válida: 8 420 XP, reputación nivel 4, 3 logros, $127 pendiente, $0 disponible, $0 pagado.
Ninguna capa se deriva de otra: el XP no sube la reputación, la reputación no genera rewards y un reward no es saldo hasta pasar a `AVAILABLE`.

### Estados del programa

Hay dos ejes, ambos derivados de las fuentes existentes (`lib/rewards/onboarding.ts`):

| Eje | Estado | Origen |
|---|---|---|
| Programa | `PAUSED` | `REWARDS_PROGRAM_ACTIVE` apagado: sin desbloqueos nuevos (`unlock.ts`) ni rewards nuevos. |
| Programa | `FROZEN` | Programa encendido y `MONEY_PATH_FROZEN` activo: hay desbloqueos, pero ningún movimiento de dinero. |
| Programa | `ACTIVE` | Programa encendido y money descongelado. |
| Cazador | `LOCKED` | `claimPhase = locked`. |
| Cazador | `ELIGIBLE` | `claimPhase = unlocked \| pending_selection` (falta aceptar términos o elegir la oferta de bienvenida). |
| Cazador | `UNLOCKED` | `claimPhase = complete`. |

`GET /api/me/rewards/status` expone `programActive` y `moneyPathFrozen`; si falta `moneyPathFrozen`, la UI asume congelado.

### Reward Policy (`lib/rewards/config.ts`)

| Regla | Estado | Valor / ubicación |
|---|---|---|
| Elegibilidad | IMPLEMENTADO | 15 ofertas aprobadas, 15 votantes distintos, 7 días de cuenta, 50% de aprobación con ≥5 decisiones (`qualitySignals.ts`). |
| Tasa de recompensa | IMPLEMENTADO | `REWARDS_CREATOR_SHARE_BPS` (4000). |
| Retención | IMPLEMENTADO | `REWARDS_HOLD_DAYS` (60), aplicada en `rewardsEngine.ts`. |
| Requisitos de atribución | IMPLEMENTADO | `REWARDS_CLICK_ATTRIBUTION_WINDOW_DAYS` y `AttributionMethod`; `lib/rewards/attribution/*`. |
| Pago mínimo | IMPLEMENTADO | `REWARDS_MIN_PAYOUT_CENTS` ($200), aplicado en `payout.ts` y `payoutIntent/eligibility.ts`. |
| Abuso | PARCIAL | Ban de votantes, distinct voters y clawbacks (`clawback.ts`). Sin detección de cuentas múltiples automatizada. |
| Estado del programa | IMPLEMENTADO | `REWARDS_PROGRAM_ACTIVE` + `MONEY_PATH_FROZEN`. |
| Requisitos de payout (identidad/fiscal) | NOT IMPLEMENTED en Rewards V1 | Ver sección C. |
| Solicitud de retiro por el usuario | NOT IMPLEMENTED | Hoy el pago lo opera AVENTA (payout intents / pago manual). |

Ningún componente, página, email ni API debe escribir tasas o montos: se leen de `config.ts`.

## B. Money boundary

### Cadena completa

| Etapa | Implementación actual | Estado |
|---|---|---|
| Affiliate Event | `reward_outbound_clicks`, `affiliate_economic_events` | Existe |
| Attribution | `lib/attribution/resolveConversionAttribution.ts`, `lib/rewards/attribution/*`, `manualAttribution.ts` | Existe, congelado |
| Conversion | `affiliate_conversions` (`lib/economy/recordConversion.ts`) | Existe, congelado |
| Commission | `affiliate_commissions`, `affiliate_commission_revisions`, `affiliate_ledger_entries` | Existe, congelado |
| Reward Calculation | `splitCommissionCents` (`config.ts`), `ledgerRewardBridge/*` | Existe, congelado |
| Reward Pending | `creator_rewards` `PENDING`/`VALIDATING` | Existe |
| Reward Available | `creator_rewards` `AVAILABLE` tras retención | Existe |
| Withdrawal Request | — | NOT IMPLEMENTED |
| Identity/Fiscal Validation | Legacy de comisiones (sección C) | No conectado a Rewards V1 |
| Payout Eligibility | `lib/rewards/payoutIntent/eligibility.ts` | Existe |
| Payout | `payout_intents`, `providerExecute.ts`, `reward_payouts` | Existe, congelado |
| Settlement | `ledger_settlements`, `lib/economy/settlement/*` | Existe, congelado |

Todo ejecutor que mueve dinero consulta `isMoneyPathFrozen()`: `reservePayoutIntent`, `submitPayoutIntent`, `applyProviderConfirmation`, `reconcilePayoutIntent`, `createManualRewardPayout`, la settlement y los clawbacks (`tests/rewards/moneyBoundary.test.ts`).

### Trazabilidad: «¿por qué recibió esta cantidad?»

`reward_payouts` / `payout_intents` → `creator_rewards` → comisión (`affiliate_commissions` + revisiones) → conversión (`affiliate_conversions`) → atribución (método y confianza) → evento original (`reward_outbound_clicks` / `affiliate_economic_events`).
Cada transición queda en `reward_audit_log`. Regla para cualquier extensión futura: **ninguna etapa nueva puede romper esa cadena de referencias**.

## C. Fiscal boundary

Capas distintas que nunca se mezclan:

```
User → Identity Profile → Fiscal Profile → Payout Eligibility → Tax Treatment → Payout
```

- **Identidad**: quién es la persona. NOT IMPLEMENTED.
- **Información fiscal**: residencia, régimen e identificador. Solo existe el legacy de comisiones (abajo).
- **Cálculo fiscal**: retenciones e impuestos. NOT IMPLEMENTED; `api/admin/commissions/tax-estimate` solo reporta el neto antes de impuestos y remite a un contador.
- **Payout**: liquidación (sección B).

### Contrato futuro: `FiscalProfile` (NO implementado)

| Campo conceptual | Propósito |
|---|---|
| `user_identity_ref` | Referencia al perfil de identidad verificado, no al usuario directo. |
| `tax_residency` | País de residencia fiscal. |
| `tax_regime` | Régimen declarado. Lo valida un profesional, nunca el código. |
| `tax_identifier` | Identificador fiscal, cifrado y fuera de las vistas públicas. |
| `documentation_status` | Estado de la documentación entregada. |
| `verification_status` | Resultado de la verificación. |
| `effective_from` / `effective_until` | Vigencia: un cambio de régimen crea una versión nueva, sin sobrescribir. |

Reglas del contrato:
- Se solicita **solo** cuando existe un pago que hacer, nunca antes.
- No se piden RFC, CSF, e.firma ni CSD mientras el programa no esté activo.
- Ninguna tasa (ISR, IVA, retenciones) se codifica sin validación fiscal profesional.
- Las reglas de Amazon o Mercado Libre no aplican automáticamente a AVENTA.

### Estructura legacy existente (fuera de alcance, no se tocó)

`lib/commissions/fiscal.ts` y `lib/server/commissionFiscal.ts` guardan `commission_legal_name`, `commission_rfc` y `commission_clabe` en `profiles`. Los consumen finanzas (`payout-ops`, `allocations`) con datos enmascarados.
`POST /api/me/commission-fiscal` acepta esos datos de usuarios elegibles **sin comprobar** `REWARDS_PROGRAM_ACTIVE` ni `MONEY_PATH_FROZEN`. Hoy ninguna UI lo llama: su único cliente era `CommissionProgramPanel`, que se eliminó por huérfano.
Recomendación (OUT OF SCOPE, motor de comisiones): condicionarlo al programa activo o retirarlo cuando exista el `FiscalProfile`.

## D. Launch status

| Categoría | Contenido |
|---|---|
| READY NOW | Core de ofertas, moderación, Founder OS, Team/Equipo, onboarding de Rewards (pausado), XP/reputación/logros, patrocinio (house), cupones básicos. |
| POST-LAUNCH | Motor de cupones (migraciones + `offerId`), guard de estado en `expire-offer`, `rewards/status` de solo lectura, mocks de `/operaciones`, detección de cuentas múltiples. |
| BLOCKED EXTERNAL | Supabase Pro (backups / restauración probada). |
| FUTURE MONEY | Activar `REWARDS_PROGRAM_ACTIVE`, descongelar `MONEY_PATH_FROZEN`, Identity/Fiscal Profile con asesoría fiscal, solicitud de retiro, gating del endpoint fiscal legacy, proveedor de pagos real. |
