# AVENTA — Auditoría FASE 1 (FINAL SHIP PLAN)

**Fecha del snapshot:** 2026-10-16 (UTC-6)  
**Alcance:** solo lectura en repo + probes HTTP públicos. Sin cambios de código ni activación de dinero en producción.  
**Rama de trabajo local:** `feat/team-os-staff-elimination` (ahead 1 vs `origin`; **no** es el deploy de producción documentado en `master`).  
**Producción referida:** `https://aventaofertas.com`, Supabase `mkgsrpsuvedwwlzmzmzh`.

---

## 1. Veredicto preliminar GO / NO-GO

| Puerta | Veredicto | Resumen |
|--------|-----------|---------|
| **(a) Lanzamiento comunitario 1 nov** | **GO con condiciones** | Producto y salud técnica en verde en probes del 16-oct; catálogo y feed operativos. Quedan ítems de **ops/owner** (backup Supabase, smoke móvil, confirmación explícita de env de dinero, comunicación). |
| **(b) Cohorte monetaria Rewards (~100 cazadores)** | **NO-GO** | Motor y freeze están en código, pero faltan **staging E2E de dinero**, **fiscal/identidad V1**, **proveedor de pagos productivo**, **GO legal/finanzas** y **no** se debe descongelar `MONEY_PATH_FROZEN` en prod en esta fase. |

---

## 2. Evidencia fresca (2026-10-16)

| Señal | Estado | Evidencia |
|-------|--------|-----------|
| Health prod | **VERIFIED** | `GET /api/health` → `status: ok`, `feedViewOk: true`, `offersCount: 1594` |
| Feed prod | **VERIFIED** | `GET /api/feed/home?limit=3&view=latest` → `success: true`, ofertas con `expires_at` futuro |
| Tests launch | **VERIFIED** | `npx vitest run tests/launch` → 21 archivos, **122** tests OK |
| Flags Vercel prod | **LIKELY** | Última lectura documentada 2026-10-15 en `SOFT_LAUNCH_NOV_1_2026.md`: `MONEY_PATH_FROZEN=true`, `REWARDS_PROGRAM_ACTIVE=true` (Fase A reconocimiento), `REWARDS_PAYOUT_ENABLED=false`; **no re-leídos hoy** |
| Ledger prod `payout_intents` | **LIKELY** | Doc 15-oct: **0** filas; sin SQL en esta pasada |
| PR #143 seguridad en prod | **VERIFIED** | `docs/SECURITY/PR143_PRODUCTION_APPLY_20261015.md` |
| Supabase Pro + restore | **UNKNOWN** | Blocker histórico en `AVENTA_FINAL_GO_NO_GO.md`; sin verificación en esta pasada |

---

## 3. Inventario P0 / P1 / P2

Estados: **VERIFIED** (evidencia directa en repo o probe), **LIKELY** (documentación reciente coherente con código), **UNKNOWN** (requiere panel owner / manual).

### P0 — Antes del lanzamiento comunitario

| # | Ítem | Estado | Evidencia | Dependencias | Owner | Orden |
|---|------|--------|-----------|--------------|-------|-------|
| P0-1 | **Backup / restore Supabase administrable** | UNKNOWN | `AVENTA_LAUNCH_READINESS.md`, `scripts/restore-checklist.mjs` (histórico exit 2) | Plan Pro + restore a proyecto nuevo | **ops** | 1 |
| P0-2 | **Kill-switch dinero en prod** (`MONEY_PATH_FROZEN` explícito true) | LIKELY | `lib/server/moneyPathFreeze.ts` (prod ausente = frozen); doc 15-oct | Dashboard Vercel `aventa-new` Production | **ops** | 2 |
| P0-3 | **Pagos apagados** (`REWARDS_PAYOUT_ENABLED=false`) | LIKELY | `lib/rewards/betaCohort.ts`, doc 15-oct | Vercel | **ops** | 2 |
| P0-4 | **No desplegar rama Team OS sin migración SQL** | VERIFIED | `docs/SYSTEMS/STAFF_ELIMINATION_AUDIT_AND_MIGRATION.md` §7–8; prod sigue `user_roles` moderator (PR143) | `20261017_staff_roles_to_team_memberships.sql` + membresías | **eng** | 3 (si se mergea) |
| P0-5 | **RLS / vistas críticas** (feed solo approved, sin escritura cliente en vistas) | VERIFIED | PR143 apply; `tests/launch/clientViewWriteLockdown.test.ts` | — | **eng** | — (cerrado) |
| P0-6 | **Moderación API sin sesión → 401** | VERIFIED | Matriz oct-04; guards en `requireAdmin` / `collaboratorAuth` (rama feat) | Deploy en `master` usa `user_roles` legacy | **eng** | — |

### P0 — Adicional si se abre dinero real (cohorte monetaria)

| # | Ítem | Estado | Evidencia | Dependencias | Owner | Orden |
|---|------|--------|-----------|--------------|-------|-------|
| P0-M1 | **Staging: dinero descongelado probado** | UNKNOWN | `MONEY_REWARDS_STAGING_ACTIVATION.md`, `scripts/verify-rewards-staging.mjs` | Env staging + crons 24h | **eng/ops** | 1 |
| P0-M2 | **Términos / comunicación legal programa** | UNKNOWN | `MONEY_REWARDS_PRODUCTION_FRIENDS_PILOT.md` §Fase B; UI `app/me/recompensas/page.tsx` | Producto + legal | **product** | 2 |
| P0-M3 | **Fiscal Rewards V1** (no solo legacy `commission_*`) | VERIFIED gap | `docs/REWARDS_MONEY_FISCAL_BOUNDARY.md` §C | Asesor fiscal | **product/ops** | 3 |
| P0-M4 | **`POST /api/me/commission-fiscal` sin gate de programa** | VERIFIED | `REWARDS_MONEY_FISCAL_BOUNDARY.md` §C | Endurecer o retirar antes de cohorte | **eng** | 3 |
| P0-M5 | **Proveedor SPEI real** (`PAYOUT_PROVIDER`) | LIKELY stub | `lib/rewards/payoutIntent/resolveProvider.ts`, `realProviderConfig.ts` | Contrato PSP + webhook | **ops** | 4 |
| P0-M6 | **GO escrito finanzas antes de `MONEY_PATH_FROZEN=false` en prod** | N/A | `MONEY_REWARDS_GO_LIVE.md` | — | **ops** | 5 |

### P1 — Antes de escalar tráfico

| # | Ítem | Estado | Evidencia | Dependencias | Owner | Orden |
|---|------|--------|-----------|--------------|-------|-------|
| P1-1 | **Smoke móvil manual (15 min)** | UNKNOWN | `SOFT_LAUNCH_NOV_1_2026.md` §pendiente 4 | QA/owner | **product** | 1 |
| P1-2 | **Cola moderación + SLA lanzamiento** | LIKELY | Doc 15-oct: pending **0**; mantener | Moderación | **ops** | 1 |
| P1-3 | **Copy público: “recompensas monetarias no disponibles”** | UNKNOWN | Marketing + `lib/rewards/onboarding.ts` | Alineación con Fase A prod | **product** | 2 |
| P1-4 | **Redis / rate limit global feed** | LIKELY gap | `AVENTA_ENGINEERING_CLOSURE.md` §D (preview sin Redis) | `AVENTA_REDIS_ENVIRONMENT` en prod | **eng/ops** | 3 |
| P1-5 | **Cierre Team OS en prod** (SQL + retirar staff legacy) | OPEN | `STAFF_ELIMINATION_AUDIT_AND_MIGRATION.md` checklist §8 | Migración + validación | **eng/ops** | 4 |
| P1-6 | **Atribución ML ↔ ledger conciliada** | UNKNOWN | `mercadolibre` capability `cancellation` limitada | Ingest + finanzas | **eng** | 5 |
| P1-7 | **Antifraude: sin multi-cuenta automático** | VERIFIED gap | `REWARDS_MONEY_FISCAL_BOUNDARY.md` §A (PARCIAL) | Post-launch o reglas manuales | **eng** | 5 |
| P1-8 | **PRs cierre producto semana 15-oct** (modal recompensas, dupes moderación, MCP precio) | LIKELY partial | `ciClosure.test.ts` (SheetFrame opaco en **código**); SOFT_LAUNCH A–C “PR pendiente” | Merge a `master` | **eng** | 2 |

### P2 — Post-lanzamiento

| # | Ítem | Estado | Evidencia | Owner |
|---|------|--------|-----------|-------|
| P2-1 | Auth HaveIBeenPwned | UNKNOWN | Advisor histórico | **ops** |
| P2-2 | Retiro self-service usuario | NOT IMPLEMENTED | `MONEY_REWARDS_GO_LIVE.md` | **eng** |
| P2-3 | 61 tablas RLS sin policies (deny-all) | NON-BLOCKING | Matriz oct-04 | **eng** |
| P2-4 | Objetivo 10k usuarios mes 1 | N/A | `SOFT_LAUNCH_NOV_1_2026.md` §E | **product** |
| P2-5 | Residuales UI leyendo `user_roles` en moderación | OPEN | `STAFF_ELIMINATION_AUDIT_AND_MIGRATION.md` §7.4 | **eng** |

---

## 4. Áreas inspeccionadas (resumen)

### Producto crítico (auth, ofertas, votos, comentarios, móvil)

- **Auth / guards:** middleware + `requireOwner` / moderación; en **`master`** moderación usa `user_roles`; en **rama feat** usa `lib/server/collaboratorAuth.ts` + permisos Team OS.
- **Ofertas / feed:** health y feed prod OK; tests `tests/launch/offerExperience.test.ts`, `communityFeedTakedown.test.ts`.
- **Votos / comentarios:** reputación y distinct voters en `lib/rewards/qualitySignals.ts`; E2E histórico 13/13 en `AVENTA_ENGINEERING_CLOSURE.md`.
- **Móvil:** responsive verificado en oct-04; **smoke real pendiente** (UNKNOWN).

### Catálogo / ingestión / moderación

- Ingestión: `lib/offers/ingestion/ingestOfferObservation.ts` (idempotency), MCP `lib/mcp/submissions.ts`.
- Moderación: paneles `app/admin/moderation/*`, affiliate readiness `lib/moderation/affiliateReadinessContract.ts`.
- Supply/crons: `vercel.json` — `offer-health-scan`, `supply-engine`, `process-write-queue`, etc.

### Rewards monetario

| Flag | Rol | Default / prod |
|------|-----|----------------|
| `REWARDS_PROGRAM_ACTIVE` | Desbloqueos + acumulación si money descongelado | fail-closed OFF (`lib/rewards/programStatus.ts`); **doc prod: ON (Fase A)** |
| `MONEY_PATH_FROZEN` | Bloquea ledger, rewards, payouts | fail-closed ON en prod (`moneyPathFreeze.ts`) |
| `REWARDS_BETA_UI_ENABLED` | UX cohorte; **no** acumula si programa OFF | `betaCohort.ts` |
| `REWARDS_PAYOUT_ENABLED` | Pagos cohorte | default OFF; doc prod OFF |
| `SETTLEMENT_BRIDGE_ENABLED` | Puente comisión → ledger | off unless explicit (`isSettlementBridgeEnabled.ts`) |

**Cohorte:** tabla `rewards_beta_memberships` — **presente en atlas prod** (`lib/databaseAtlas/production.snapshot.json`); migración `docs/supabase-migrations/20261005_rewards_beta_cohort.sql`; store `lib/rewards/betaCohortStore.ts`.

**Unlock vs dinero:** `lib/rewards/unlock.ts` requiere `isRewardsProgramActive()`; creación de reward respeta freeze (`tests/rewards/p04LedgerSettlements.test.ts`, `rewardsEngine.ts`).

### Atribución, ledger, payouts, idempotencia

- Cadena documentada en `REWARDS_MONEY_FISCAL_BOUNDARY.md` §B.
- Settlement races: `lib/economy/settlement/settleCommission.ts` (reload concurrente).
- Payout intents: `lib/rewards/payoutIntent/*`, tests `tests/rewards/payoutIntent.*.test.ts`, `tests/rewards/moneyBoundary.test.ts`.
- Idempotencia payout webhook: `scripts/m5-6-provider-confirmation-canary.ts` (`idempotency_key`).

### Fraude / anti-farming

- `basicFraudFlags` — `self_click`, `anonymous_click` (`lib/rewards/rewardsEngine.ts`).
- Unlock: distinct positive voters, bans (`qualitySignals.ts`, `unlock.ts`).
- Bot authors: `isEconomicallyInertAuthor` en unlock.

### Extensión

- Bridge: `app/extension/auth/page.tsx`, `lib/extension/allowedExtensionIds.ts` (allowlist P0-5).
- Tests: `tests/extension/api.test.ts`.

### Pagos (real vs simulado)

- `PAYOUT_PROVIDER` → stub/sandbox/real (`resolveProvider.ts`); real exige URL/key HTTPS (`realProviderConfig.ts`).
- Histórico prod: filas QA agosto 2026 (`AVENTA_LAUNCH_READINESS.md` Phase 10).

### Infra: RLS, crons, integridad

- PR143 aplicado en prod (oct-15).
- Crons dinero en `vercel.json` (bridge, holds, payout intent, provider confirm) — pasan freeze en código.
- Integridad: `/api/cron/system-integrity`, tests `tests/launch/integrity*.test.ts`.

### Lanzamiento / analytics

- Analytics producto: `lib/analytics/recordProductEvent.ts`, `PageViewBeacon` en `app/layout.tsx`.
- SEO: `tests/launch/sitemapIndexability.test.ts`, `brandedTitle.test.ts`.

---

## 5. Blockers históricos — ¿siguen?

| Blocker (mensajes / docs previos) | Hoy |
|-----------------------------------|-----|
| Feed vacío (12 ofertas oct-04) | **Cerrado** — health 1594 ofertas; feed con ingesta reciente |
| Scanner OOS falso en vivas | **LIKELY cerrado** — doc 15-oct: 0 OOS en vivo; regla 404/410 en `evaluateOfferHealth` |
| Supabase plan free / sin restore | **UNKNOWN** — no verificado 16-oct |
| PR #44 sin merge | **Cerrado** — línea `master` avanzó (#146, soft launch doc) |
| Dinero activo en prod | **LIKELY cerrado** — freeze + payout off documentados |
| `REWARDS_PROGRAM_ACTIVE=true` en prod sin anuncio | **RIESGO ops** — Fase A permite desbloqueos/términos sin mover dinero; requiere copy marketing alineado |
| Team OS a medias | **Abierto** — rama feat + SQL pendiente en prod |

---

## 6. Riesgo rama `feat/team-os-staff-elimination`

| Factor | Detalle |
|--------|---------|
| Estado git | `ahead 1` de `origin/feat/team-os-staff-elimination`; **3 commits** por encima de `master` (Team OS auth, staff-roles UI) |
| Producción | Despliega **`master`**, no esta rama |
| Riesgo merge prematuro | Moderación pasa a Team OS; sin SQL `20261017_staff_roles_to_team_memberships.sql` y sin membresías, **colaboradores podrían perder acceso** |
| Contradicción producto | Doc eliminación staff vs reintroducción `app/admin/staff-roles/TeamRolesPanel.tsx` en la rama — revisar intención antes de merge |
| Recomendación lanzamiento 1 nov | **No mergear** esta rama como gate del soft launch salvo checklist §8 del doc de eliminación en **staging → prod** |

---

## 7. Checklist 27 ítems (secciones A–E)

Referencia de filas: combinación de puertas en `docs/RELEASES/AVENTA_ENGINEERING_CLOSURE.md`, entregas A–E en `SOFT_LAUNCH_NOV_1_2026.md`, y gates de dinero en `MONEY_REWARDS_GO_LIVE.md`.  
**%** = estimación de cierre para **lanzamiento comunitario 1 nov** (no para cohorte monetaria).

### A — Producto y comunidad (6)

| # | Criterio | % | Falta |
|---|----------|---|-------|
| A1 | Feed / home / plaza responden | 100% | — |
| A2 | Ficha oferta + outbound + votos + comentarios | 95% | Smoke móvil |
| A3 | Subir oferta → pending → moderación | 95% | SLA bajo carga |
| A4 | Auth sesión + rutas `/me` protegidas | 100% | — |
| A5 | `/me/recompensas` copy honesto (pausa / Fase A) | 90% | Confirmar copy con `REWARDS_PROGRAM_ACTIVE` prod |
| A6 | E2E staging 13/13 (histórico) | 85% | Re-ejecutar en `master` pre-1-nov |

### B — Catálogo, ingestión, moderación (6)

| # | Criterio | % | Falta |
|---|----------|---|-------|
| B1 | Catálogo approved con volumen | 100% | Mantener ingesta |
| B2 | Health scan / OOS correcto | 95% | Monitoreo post-launch |
| B3 | Cola pending moderación | 100% | SLA en pico |
| B4 | Affiliate paste / readiness | 90% | ML edge cases |
| B5 | Duplicados / similares en Focus | 70% | PR pendiente (SOFT_LAUNCH B) |
| B6 | Lifecycle / archive | 100% | — |

### C — Rewards y dinero (6)

| # | Criterio | % | Falta |
|---|----------|---|-------|
| C1 | Freeze fail-closed código | 100% | — |
| C2 | Flags prod documentados | 80% | Re-lectura Vercel 16-oct |
| C3 | Motor ledger → reward → payout (código + tests) | 95% | — |
| C4 | Cohorte beta (`rewards_beta_memberships`) | 85% | Invitar ~100, UI beta flag |
| C5 | Staging activation dinero | 40% | `verify-rewards-staging.mjs` + 24h crons |
| C6 | Pagos reales cohorte | 15% | Fiscal V1, PSP, legal, unfreeze |

### D — Seguridad e infra (5)

| # | Criterio | % | Falta |
|---|----------|---|-------|
| D1 | PR143 / vistas / RPC hardening | 100% | — |
| D2 | Evidencia append-only / triggers | 100% | — |
| D3 | Backup Supabase Pro + restore | 30% | Owner |
| D4 | Rate limit feed (abuso) | 75% | Redis prod si escala |
| D5 | Crons protegidos (`CRON_SECRET`) | 100% | — |

### E — Lanzamiento, ops, analytics (4)

| # | Criterio | % | Falta |
|---|----------|---|-------|
| E1 | CI `ci:verify` + launch tests | 100% | 122/122 local 16-oct |
| E2 | Comunicación marketing alineada | 50% | Mensaje dinero |
| E3 | DNS / dominio prod | 95% | Confirmación owner |
| E4 | Métricas producto (page views, outbound) | 85% | Dashboards negocio |

**Totales estimados:** A **94%** · B **91%** · C **71%** (comunidad) / **15%** (cohorte pagos) · D **81%** · E **83%**  
**Promedio ponderado lanzamiento comunitario (~sin C6):** **~88%**.

---

## 8. Camino mínimo a GO — 1 de noviembre (comunidad)

1. **Owner:** confirmar en Vercel Production `MONEY_PATH_FROZEN=true`, `REWARDS_PAYOUT_ENABLED=false`; anotar si `REWARDS_PROGRAM_ACTIVE` sigue en Fase A y alinear marketing (`SOFT_LAUNCH_NOV_1_2026.md`).
2. **Owner:** Supabase Pro + restore a proyecto nuevo **o** riesgo firmado en este doc.
3. **QA/Owner:** smoke móvil 15 min (checklist doc soft launch).
4. **Eng:** merge solo PRs de bajo riesgo a `master`; **no** mergear `feat/team-os-staff-elimination` sin migración.
5. **Moderación:** plan SLA + cola en cero recurrente.
6. **Ops:** `curl` health + feed día del lanzamiento; vigilar `system-integrity`.

---

## 9. Camino mínimo — cohorte monetaria ~100 (después de comunidad estable)

1. Completar **Fase A–B** en `MONEY_REWARDS_STAGING_ACTIVATION.md` (incl. crons 24h).
2. Publicar términos + mensaje “prueba controlada”.
3. Poblar `rewards_beta_memberships` (invited → enrolled) + `REWARDS_BETA_UI_ENABLED=true` si UX beta.
4. Prod Fase A: programa ON, **freeze ON** (ya documentado).
5. GO finanzas → Fase B prod (`MONEY_PATH_FROZEN=false`) ventana acotada; monitoreo `creator_rewards` / ledger.
6. Solo con fiscal + PSP: `REWARDS_PAYOUT_ENABLED=true` y cohorte acotada (`MONEY_REWARDS_PRODUCTION_FRIENDS_PILOT.md`).

---

## 10. Referencias rápidas

- Soft launch: `docs/LAUNCH/SOFT_LAUNCH_NOV_1_2026.md`
- Dinero: `docs/LAUNCH/MONEY_REWARDS_GO_LIVE.md`, `MONEY_REWARDS_STAGING_ACTIVATION.md`
- Fronteras: `docs/REWARDS_MONEY_FISCAL_BOUNDARY.md`
- Team OS: `docs/SYSTEMS/STAFF_ELIMINATION_AUDIT_AND_MIGRATION.md`
- Tests launch: `tests/launch/*.test.ts` (122 tests)

---

*Snapshot único FASE 1 — no sustituye runbook del día del lanzamiento.*
