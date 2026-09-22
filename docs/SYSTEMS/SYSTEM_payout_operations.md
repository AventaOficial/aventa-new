# SYSTEM — Centro de Pagos (Payout Operations)

**Estado:** plan aprobado + implementación V1 (2026-09-21)  
**Ruta:** `/equipo/contabilidad/centro-pagos`  
**Acceso:** `owner` + `finance` (Contabilidad). Nadie más.  
**Principio:** el Centro **lee y explica**; no mueve dinero. Money path sigue fail-closed
(`MONEY_PATH_FROZEN`, `REWARDS_PROGRAM_ACTIVE`, `PAYOUT_PROVIDER`).

Relacionados: `SYSTEM_economy.md`, `SYSTEM_conversion_commission.md`,
`AUDIT_economy_architecture_compatibility.md`, `../POLITICA_COMISIONES_CREADORES.md`.

---

## 1. Por qué existe

El dueño no tenía un solo lugar donde entender **cómo se paga** ni **qué falta para pagar**.
El pipeline vivía partido entre `/admin/commissions`, `/admin/rewards` y `/equipo/contabilidad`.
El Centro de Pagos unifica la vista operativa para dos personas: quien decide (owner) y quien
opera (finance / contador).

Objetivo de automatización honesto:

| Capa | Meta | Hoy (medido por el Centro) |
|------|------|----------------------------|
| Pipeline interno (ingest → split → hold → lote) | 95–99 % | ~60–70 % |
| Salida de dinero (SPEI + conciliación) | 70–90 % de envíos sin tocar | 15–25 % (stub / manual) |
| Decisión de liberar lote | **siempre humana** (gate) | humana |

El 1–5 % residual son excepciones: CLABE inválida, primer pago, cambio de cuenta bancaria,
clawbacks, fraude, fiscal. **SPEI asentado es irrevocable**: por eso el primer pago y los cambios
de cuenta siempre pasan por revisión.

---

## 2. Modelo mental: las 6 cajas

```
1 ENTRA   → comisión confirmada por la red (Amazon / ML / CSV)     [ingest]
2 REPARTE → 40 % creador / 60 % plataforma (splitCommissionCents) [split]
3 ESPERA  → hold 60 d por devoluciones (VALIDATING → AVAILABLE)   [hold]
4 JUNTA   → lote: quién ≥ $200 MXN y pasa gates                    [batch]
5 SALE    → SPEI a CLABE (payout_intents → provider)               [disburse]
6 CIERRA  → banco cuadra con ledger; excepciones a cola            [reconcile]
```

Cada caja tiene un **nivel de automatización**:

| Nivel | Significado |
|-------|-------------|
| `auto` | Código + cron lo hace solo; humano solo mira excepciones |
| `semi` | Sistema prepara, humano aprueba / importa / confirma |
| `manual` | Humano lo hace a mano (ej. SPEI en banca) |
| `blocked` | No puede correr: falta evidencia, proveedor o flag |

El nivel se **calcula** (`lib/finance/payoutOps/stages.ts`) a partir de runtime + datos, no se
declara a mano. Ejemplo: `disburse` es `manual` mientras `PAYOUT_PROVIDER` sea
`manual_spei|stub|sandbox`; pasa a `semi` con proveedor `real` configurado.

---

## 3. Roles

| Rol | En el Centro |
|-----|--------------|
| `owner` | Ve todo, aprueba política, decide liberar lote (cuando exista money path) |
| `finance` | Opera: importa evidencia, revisa excepciones, prepara lote, marca conciliación |
| `admin`, `gerente` | **Sin acceso** al Centro (siguen viendo el resto de Contabilidad según sus gates) |
| Contador fiscal externo | Fuera del producto (CFDI, ISR). El Centro le exporta contexto, no lo reemplaza |

Gate: `requirePayoutOps` en `lib/staff/requireFinanceStaff.ts` (`PAYOUT_OPS_ROLES = owner, finance`).
Para ampliar acceso se edita **solo** esa constante.

No se crea rol `contador`: ya existe `finance` (label "Contabilidad").

---

## 4. Gates por beneficiario (payee)

`evaluatePayeeGates()` — puro, testeado. Orden de evaluación:

| Código | Decisión | Regla |
|--------|----------|-------|
| `below_minimum` | `carry` | saldo < `REWARDS_MIN_PAYOUT_CENTS` → acumula al siguiente periodo |
| `fiscal_incomplete` | `fail` | nombre legal < 5 chars o RFC inválido |
| `clabe_missing` / `clabe_invalid` | `fail` | sin CLABE o dígito verificador incorrecto |
| `terms_missing` / `terms_outdated` | `fail` | no aceptó términos o versión ≠ vigente |
| `rfc_duplicate` | `fail` | RFC en más de una cuenta |
| `clawback_pending` | `review` | ajustes de clawback abiertos |
| `fraud_flags` | `review` | `creator_rewards.fraud_flags` no vacío |
| `first_payout` | `review` | nunca se le ha pagado (SPEI irrevocable) |
| `bank_details_changed` | `review` | fiscal actualizado después del último pago |
| — | `pass` | todo lo anterior limpio |

`fail` nunca se auto-resuelve; `review` lo resuelve finance; `pass` es lo único que un futuro
proveedor real enviaría sin intervención.

---

## 5. Lote (batch preview)

`buildPayoutBatchPreview()` agrupa `creator_rewards.status = 'AVAILABLE'` por `creator_id`,
excluye recompensas con `payout_id` o con `payout_intents` en `RESERVED|SUBMITTED`
("en vuelo"), suma `creator_share_cents`, aplica gates y devuelve totales:

- `payable` (pass) · `review` · `blocked` (fail) · `carry` (bajo mínimo) · `inFlight`

`readyToRelease` es `true` solo si: no hay freeze, programa activo, proveedor resuelto,
≥ 1 línea `pass` y 0 líneas `review`. Hoy siempre `false` en producción (fail-closed), y el
Centro lo dice explícitamente con `releaseBlockers`.

**El Centro no libera lotes.** Cuando exista money path, la acción vivirá detrás de
`requirePayoutOps` + confirmación explícita + idempotencia (ya existe en `payout_intents`).

---

## 6. Runbook del periodo

Lista viva de pasos con estado calculado (`buildRunbook()`):

| # | Paso | Actor | Cómo se marca `done` |
|---|------|-------|----------------------|
| 1 | Evidencia de red importada | finance | ledger `PRODUCTION` con `source csv_import|api` en el periodo |
| 2 | Comisiones asentadas en ledger canónico | sistema | 0 `affiliate_commissions.approved` sin `ledger_entry_id` |
| 3 | Recompensas creadas (split) | sistema | ≥ 1 `creator_rewards` creada en el periodo |
| 4 | Holds liberados | sistema (cron) | 0 `VALIDATING` con `hold_until` vencido |
| 5 | Lote preparado + gates | finance | lote con líneas y 0 `review` pendientes |
| 6 | Aprobación de lote | owner / finance | siempre humano; `blocked` si freeze |
| 7 | Ejecutar SPEI | sistema / finance | `blocked` sin proveedor; `done` si 0 `RESERVED` |
| 8 | Confirmar y conciliar | sistema / finance | 0 `SUBMITTED` sin resolver |
| 9 | Fiscal / CFDI | externo | informativo (`na`) |

---

## 7. Cola de excepciones

| Tipo | Severidad | Fuente |
|------|-----------|--------|
| `intent_failed` / `intent_unknown` | critical | `payout_intents` |
| `intent_stale` (> 48 h en RESERVED/SUBMITTED) | attention | `payout_intents` |
| `reward_fraud_flags` | attention | `creator_rewards.fraud_flags` |
| `clawback_pending` | attention | `reward_clawback_adjustments` |
| `payee_gate_fail` / `payee_gate_review` | attention | lote |
| `ledger_unattributed` | info | `affiliate_ledger_entries.attributable=false` (100 % plataforma) |
| `ledger_synthetic` | info | filas QA excluidas (`financialRecordClass`) |

---

## 8. Score de automatización

Heurística explícita (`automationScore.ts`), pesos por caja:
ingest 20 · split 10 · hold 10 · batch 15 · disburse 30 · reconcile 15.
Valor por nivel: auto 1.0 · semi 0.6 · manual 0.15 · blocked 0.

- `internalPct` = cajas 1–4 (lo que Aventa controla)
- `endToEndPct` = las 6

Sirve para ver **qué desbloquea el siguiente 10 %**, no como métrica de vanidad. Cada caja
declara `nextUnlock` (qué hace falta para subir de nivel).

---

## 9. Roadmap de evolución

| Fase | Entrega | Efecto en score |
|------|---------|-----------------|
| **V1 (hecho)** | Centro read-only, gates, lote preview, runbook, excepciones, score | Visibilidad |
| **V2** | Evidence Capture Amazon: parser CSV Orders/Earnings → `affiliate_commissions` con `external_commission_id` | ingest → `semi` real |
| **V3** | Acción "Preparar lote" persistida (tabla `payout_batches`, idempotente) + aprobación owner/finance con doble confirmación | batch → `auto` prep |
| **V4** | Proveedor SPEI real (STP / PSP) vía `PAYOUT_PROVIDER=real` + webhook firmado | disburse → `semi`, reconcile → `semi` |
| **V5** | Auto-release de lote si todos los gates pasan + fondos + match rate ≥ umbral | 95 %+ interno |
| **V6** | Export contable (CSV/CFDI helper) para contador externo | fiscal |

Reglas que no cambian: primer pago y cambio de CLABE siempre `review`; SPEI asentado no se
revierte (un clawback es una **nueva** transferencia o descuento futuro); una sola fuente de
verdad contable (`affiliate_ledger_entries`).

---

## 10. Archivos

| Archivo | Rol |
|---------|-----|
| `lib/finance/payoutOps/types.ts` | Contratos del snapshot |
| `lib/finance/payoutOps/stages.ts` | 6 cajas + clasificación de automatización |
| `lib/finance/payoutOps/payeeGates.ts` | Gates por beneficiario |
| `lib/finance/payoutOps/batchPreview.ts` | Lote (agrupación + totales) |
| `lib/finance/payoutOps/automationScore.ts` | Score heurístico |
| `lib/finance/payoutOps/exceptions.ts` | Cola de excepciones |
| `lib/finance/payoutOps/runbook.ts` | Pasos del periodo |
| `lib/finance/payoutOps/buildPayoutOpsSnapshot.ts` | Loader Supabase tolerante a tablas ausentes |
| `lib/staff/requireFinanceStaff.ts` | `requirePayoutOps` (owner + finance) |
| `app/api/staff/finance/payout-ops/route.ts` | `GET` snapshot |
| `app/equipo/contabilidad/centro-pagos/page.tsx` | Página |
| `app/equipo/contabilidad/components/PayoutOpsPanel.tsx` | UI |
| `tests/finance/payoutOps.*.test.ts` | Contratos |

---

## 11. Lo que el Centro NO hace (a propósito)

- No llama crons de escritura ni `createManualRewardPayout` / `settleCommission`.
- No cambia flags de entorno.
- No inventa comisión = precio × %. Solo lee comisión confirmada.
- No paga a compradores (cashback): la unidad es el **creador de la oferta**.
