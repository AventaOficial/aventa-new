# Estimación de recompensas

La estimación es una proyección de lectura. No es dinero, no es saldo y no es una comisión confirmada.

No escribe `affiliate_commissions`, `creator_rewards`, `affiliate_ledger_entries`, payouts ni métricas de XP, logros, reputación o desbloqueo. No cambia `MONEY_PATH_FROZEN`, `REWARDS_PROGRAM_ACTIVE` ni `REWARDS_PAYOUT_ENABLED`.

## A. Qué es una estimación

Es la respuesta a “cuánto podría generar esta oferta si después existe una conversión válida, atribuida y confirmada por el retailer”.

Toda respuesta de `estimateReward` lleva `isEstimate: true` y `withdrawable: false`.

## B. Cómo se calcula

La cadena es:

1. Retailer.
2. Categoría de producto.
3. Tasa estimada de comisión de afiliado.
4. Comisión de afiliado estimada, con tope si la regla lo tiene.
5. Tasa de recompensa del cazador.
6. Recompensa estimada del creador.

La recompensa no es un porcentaje del precio.

Ejemplo vigente en `amazon_mx_standard_2026_10`, con un precio que no llega al tope:

- Precio $1,000 MXN.
- Amazon MX, Celulares, 7%.
- Comisión estimada: 1,000 × 0.07 = $70 MXN.
- Nivel 1, 5% de esa comisión = $3.50 MXN.

El mismo celular a $19,999 MXN da 19,999 × 0.07 = $1,399.93 antes del tope. Celulares no está en el grupo de $800, así que el tope es $500 MXN. La estimación que se muestra es $500 de comisión y, al 5%, $25 de recompensa. El snapshot guarda también el importe sin tope.

El redondeo de la estimación es half-up sobre centavos. La recompensa real, cuando exista, usa `splitCommissionCents`, que trunca hacia abajo.

## C. Precio y comisión

Aventa no reparte el precio del producto. La recompensa se calcula sobre la comisión que el retailer registra para Aventa.

## D. Estimación y comisión confirmada

`estimated_creator_reward` no se convierte en `creator_reward`.

Cuando hay una comisión confirmada, `projectRewardFromConfirmedCommission` reparte solo ese importe confirmado con la misma tasa de recompensa (`REWARDS_CREATOR_SHARE_BPS` o `rewardsLevelShareBps`). No lee la estimación.

## E. Oferta de Bienvenida y niveles

Una sola fuente:

- Oferta de Bienvenida: `REWARDS_CREATOR_SHARE_BPS` (40% de la comisión atribuida).
- Ofertas posteriores: `rewardsLevelShareBps`. El nivel 1 es 5% y el nivel 8 es 40%. No hay porcentajes intermedios fuera de esa función.

## F. Versionado

Cada regla tiene retailer, categoría, tasa, fuente, versión, vigencia, tope y moneda. La versión actual de Amazon MX es `amazon_mx_standard_2026_10`.

El resultado incluye un snapshot: precio de origen, moneda, MXN canónico, tipo de cambio si hubo, tasa, versión, comisión estimada, tasa de recompensa, recompensa estimada y fecha.

## G. Si el retailer cambia la tasa

La regla vieja se cierra con `effectiveUntil`. La nueva entra con otra `effectiveFrom` y otra `rateVersion`. Una estimación ya tomada conserva el snapshot de la versión con la que se calculó. No se recalcula con la tasa nueva.

## H. Mercado Libre

No hay en el producto una tabla oficial y versionada de tasas por categoría. La estimación responde `no_reliable_rate` y no inventa un porcentaje. El mismo contrato de reglas puede recibir una tabla de Mercado Libre más adelante sin cambiar el cálculo de la recompensa.

## I. De la estimación a una recompensa real

La estimación es previa e informativa. El dinero real sigue el camino que ya existe: atribución, comisión confirmada, validación, recompensa, ledger y payout. Ese camino permanece congelado. La estimación no lo abre.

## Política de snapshot

LIVE PREVIEW: `estimateReward` calcula el snapshot en el momento y lo devuelve. No se guarda. Sirve para explicar una cifra en pantalla. Si la regla vigente cambia, un recálculo usa la regla nueva. El objeto ya devuelto no se reescribe.

ECONOMIC EVENT: una conversión atribuida, una comisión confirmada o un `creator_rewards` no usan ese preview como historia. La comisión confirmada entra solo con `confirmedAffiliateCommissionFromLedger`, que exige un `ledgerEntryId`. `rewardsEngine` reparte `ledger.amount_cents` con `rewardShareBps`. La Oferta de Bienvenida es la oferta en `welcome_offer_id` y usa el 40%. Una oferta posterior usa el nivel de `rewardsLevelShareBps`. El asiento guarda `creator_share_bps`, el contexto y el nivel en la auditoría. Un actor ausente, nulo o desconocido no recibe recompensa estimada.

## J. Qué sigue congelado

- No hay payouts ni retiros desde una estimación.
- No hay saldo retirable.
- No hay asientos de ledger ni filas de `creator_rewards` creadas por esta capa.
- Los actores `MACHINE_HUNTER` y `SYSTEM` no reciben recompensa estimada.
- `economic_shadow_projections` no se usa aquí: esa tabla exige una comisión real.

La UI de `/me/recompensas` muestra el ejemplo llamando a `illustrativePhoneEstimate`. Las cifras salen del servicio, no de un número fijo en el componente.
