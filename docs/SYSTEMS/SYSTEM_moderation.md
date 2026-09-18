# SYSTEM — Moderación (Moderation OS)

## Session integrity (P0.3C)

Focus distingue **CLAIMED** (lease servidor), **SKIPPED** / **ACTIONED** (sesión de pestaña), e **Historial** (`goPrev` sin claim).

Detalle canónico: [`MODERATION_SESSION_SEMANTICS.md`](./MODERATION_SESSION_SEMANTICS.md).

## Editor canónico (P0.4)

`ModerationFixSheet` → `PATCH /api/admin/update-offer`.

Campos: price, original_price, offer_url, msi_months, **bank_coupon**, coupons, title, image_*, category, description.

Discount = derivado UI (nunca columna). MSI bot ingest = UNKNOWN (ver `RESEARCH_msi_ingest_gap_p04.md`).

## Architecture

**Modelo operativo:** Focus Mode (una oferta a la vez) + **lease/claim atómico**.
No hay cola split-panel como fuente de verdad; el claim server-side es la autoridad.

| Superficie | Ruta |
|---|---|
| Admin Focus | `/admin/moderation` |
| Equipo Focus | `/equipo/moderacion`, `/bot`, `/cazadores` |

**Ownership = lease temporal** (`offers.locked_by` + `offers.locked_at`), TTL **5 min** con heartbeat.
No existe `assigned_to` permanente en FASE 1 — la asignación es claim colaborativo.

## Data flow

1. Oferta nueva → `status = pending` → entra a cola claim-eligible.
2. Moderador abre Focus → `POST /api/admin/moderation/claim-next`.
3. Servidor: libera locks stale → ordena por prioridad → `tryAcquireModerationLock` (UPDATE condicional).
4. Heartbeat `POST /api/admin/moderation-lock` cada ~60s.
5. Decidir: approve/reject (`moderate-offer`), snooze, editar/replace-link (`update-offer`).
6. Sin lock propio activo → **409** (excepto bulk owner/admin).
7. Lease expirado → recovery pasivo (claim-next / ops-stats / cron system-integrity) + audit `lock_reclaimed_stale`.

## Lock / reclaim

| Pieza | Archivo |
|---|---|
| TTL / stale check | `lib/moderation/moderationLock.ts` |
| Acquire atómico | `lib/moderation/atomicModerationLock.ts` → `tryAcquireModerationLock` |
| Ownership assert | `assertModeratorOwnsLock` |
| Stale release + audit | `lib/moderation/releaseStaleLocks.ts` |
| Claim next | `lib/moderation/claimNextModerationOffer.ts` |
| Manual reclaim (owner/admin) | `POST /api/admin/moderation/reclaim-stale` |
| Cron piggyback | `app/api/cron/system-integrity` |

**Garantía:** dos moderadores no pueden claim legítimo de la misma oferta simultáneamente (UPDATE condicional + tests de concurrencia).

## Priority

`lib/moderation/moderationPriority.ts` → P1_HIGH_VALUE … P4_LOW_VALUE.
Deal Score / señales bot alimentan prioridad; **no modifican DQE**.

## Audit

- **Legacy action log:** `moderation_logs` (offer, user, action, previous/new status, reason, metadata, timestamp).
- **Outcomes canónicos:** `moderation_outcomes` (`claim|approve|reject|snooze`) con `idempotency_key`.
- Reclaim escribe `lock_reclaimed_stale` vía `writeModerationAudit`.

## Metrics

- `GET /api/admin/moderation-ops-stats` → backlog, SLA, throughput, claimed, reclaim, byModerator.
- `lib/moderation/moderatorMetrics.ts` → agregación por moderador desde `moderation_logs`.

## Auth

`requireModeration` → owner | admin | moderator.
Bulk / reclaim-stale → owner | admin.
Nunca confiar en role/userId del cliente.

## Mobile UX

Focus móvil validado — **no rediseñar**. Acciones principales: approve / reject / replace-link.
Ownership/contexto enriquecido solo en desktop (`FocusDesktopContext`).

## Edge cases

- Re-approve/reject mismo status → `{ idempotent: true }`.
- Lock ajeno / stale → 409.
- Claim vacío → `{ claimed: false }` (cola vacía / todo locked).
- Supply Engine WRITE=0 no afecta este sistema.
