# Dinero y recompensas monetarias — qué está hecho y qué falta

El **motor** (ledger, holds, payout intents, freeze) está implementado y probado en tests. El lanzamiento público del **1 nov** puede ir **sin** activar dinero. Activar pagos reales es un paso aparte.

## Ya implementado (código)

| Pieza | Ubicación |
|-------|-----------|
| Kill-switch producción | `MONEY_PATH_FROZEN` → `lib/server/moneyPathFreeze.ts` (fail-closed) |
| Programa rewards | `REWARDS_PROGRAM_ACTIVE` → `lib/rewards/programStatus.ts` |
| Cálculo y estados | `lib/rewards/rewardsEngine.ts`, `config.ts`, `payout.ts` |
| Payout intents / provider | `lib/rewards/payoutIntent/*` |
| UI pausada / honesta | `lib/rewards/onboarding.ts`, `/me/recompensas` |

## No implementado (no se “termina” solo con env vars)

| Pieza | Impacto |
|-------|---------|
| Solicitud de retiro por el usuario | Hoy opera Aventa (manual / payout intents admin) |
| Fiscal Profile Rewards V1 | Legacy `commission_*` en `profiles`; sin UI pública |
| Proveedor de pagos productivo | Integración y conciliación operativa |
| Asesoría fiscal (ISR/IVA/retenciones) | Fuera de código |

## Secuencia recomendada para encender dinero (post-lanzamiento)

1. Cerrar #143 en **producción** con precheck de esquema.
2. Supabase Pro + restore probado (ledger `AVENTA_LAUNCH_READINESS.md`).
3. Staging: `REWARDS_PROGRAM_ACTIVE=true`, `MONEY_PATH_FROZEN=false` → smoke de crons y payout intent en sandbox.
4. Producción: mismo orden; **primero** programa activo con money aún congelado; luego descongelar con ventana de observación.
5. Comunicación legal/términos del programa antes de `REWARDS_PROGRAM_ACTIVE=true` en prod.

## Variables (Vercel)

```env
REWARDS_PROGRAM_ACTIVE=false   # hasta anuncio oficial
MONEY_PATH_FROZEN=true         # en prod usar true explícito hasta GO de finanzas
```

En preview/dev, ausente `MONEY_PATH_FROZEN` puede descongelar; en **production** ausente = congelado.

## Relación con #143

Endurecer vistas/RPC **no** activa recompensas. Evita fugas mientras el programa sigue en `PAUSED`/`FROZEN`.
