# AUDIT — Moderation Focus Queue (P0.3B)

**Fecha:** 2026-09-16  
**Alcance:** Forensic audit only. Sin cambios de código, schema, money, Supply WRITE, DI, DQE, autoApprove/autoPublish.  
**Clasificación primaria:**

```
QUEUE_DUPLICATION = CONFIRMED
```

**Matiz obligatorio (no diluye CONFIRMED):**

| Fenómeno | Veredicto |
|----------|-----------|
| Misma `offer_id` vuelve a ser **current** en la misma sesión sin haber sido aprobada/rechazada (skip / exclude ring / snooze / lease stale) | **CONFIRMED** (por diseño + código) |
| Dos moderadores con **lock activo no-stale** sobre la misma oferta | **NOT_REPRODUCED** (UPDATE condicional atómico) |
| Oferta **approved/rejected** vuelve a `pending` solo por refresh/claimNext | **NOT_REPRODUCED** en código de cola (salvo demote material vía update-offer) |
| Duplicado visual **simultáneo** (dos cards del mismo ID) en Focus | **NOT_REPRODUCED** (un solo `offer` + history dedupe por id) |
| Evidencia de producción cuantitativa (conteos SQL live) | **UNKNOWN** (MCP Supabase no disponible en esta pasada; solo lectura no ejecutada) |

---

## 1. RESULT

La Focus Queue **no es una lista paginada**. Es un ciclo **claim-one → decidir/saltar → claim-next** con:

- lease de colaboración (`locked_by` / `locked_at`, TTL **5 min**),
- exclusión cliente de **últimos 40 IDs**,
- history local de **últimos 30**,
- SELECT servidor `pending ORDER BY created_at ASC LIMIT 1000` + sort editorial en memoria,
- **releaseStale** pasivo (hasta 100) en **cada** `claimNext`.

La observación de campo (“cerca del final parecen cargar más / algunas reaparecen”) es **explicable y reproducible en arquitectura** sin necesidad de un bug de paginación OFFSET:

1. El contador UI `Oferta {position} de {total}` usa `total = max(globalPending, availableEstimate, position)` — cuando el backlog “revivible” sube (stale unlock, ingest, exclude que rota), **parece** que la cola creció.
2. `goNext` / flecha derecha **libera el lock y deja la oferta en `pending`**; tras ~40 acciones el ID sale de `excludeRef` y **puede reclamarse otra vez**.
3. Cada `claimNext` ejecuta `releaseStaleModerationLocks` → ofertas abandonadas vuelven elegibles justo cuando el moderador siente “fin de cola”.
4. `goPrev` rehidrata snapshots del history (incluso ya decididas) **sin** nuevo claim — apariencia de repetición sin duplicar claim en DB.

**¿Puede ocurrir duplicación real de claim activo en producción?**  
**No** entre dos workers con lease fresco: gana un solo `UPDATE … WHERE status=pending AND (lock null | own | stale)`.  
**Sí** re-claim legítimo tras lease expirado o tras skip/snooze.

---

## 2. ROOT CAUSE

**Causa raíz de la apariencia de duplicación / “más ofertas al final” (compuesta):**

| # | Mecanismo | Tipo |
|---|-----------|------|
| R1 | `excludeRef` / `excludeOfferIds` = ring buffer **slice(-40)**; skip (`goNext`) no cambia `status` | Re-entry legítima de pending |
| R2 | `releaseStaleModerationLocks` en cada claim (limit 100) reabre elegibilidad | Re-entry legítima post-lease |
| R3 | UI `total = max(pending, available, sessionCursor)` | Ilusión de “cargar más” |
| R4 | `goPrev` + history (30) muestra IDs ya vistos sin claim | Solo presentación |
| R5 | Ventana `CLAIM_QUEUE_HARD_CAP=1000` + sort mutable; al vaciar/liberar cambian candidatos | Ventana mutable (no OFFSET, pero shifting set) |

**No es root cause primaria:** paginación OFFSET/cursor de lista Focus (no existe).  
**No es root cause primaria:** SWR/React Query (no usado en este hook).  
**No demostrado:** approved → pending sin demote material.

---

## 3. CURRENT QUEUE ARCHITECTURE

```
[Cliente] useModerationFocusQueue
    │  POST /api/admin/moderation/claim-next
    │  body: releaseOfferId?, excludeOfferIds?, sourceTab?, preferOfferId?
    ▼
[Route] claim-next/route.ts → requireModeration → claimNextModerationOffer
    │
    ├─ releaseModerationLockIfOwner(releaseOfferId)
    ├─ releaseStaleModerationLocks({ limit: 100 })
    ├─ counts: pending / locked pending / pending>24h
    ├─ SELECT pending ORDER BY created_at ASC LIMIT 1000
    ├─ filter sourceTab (bot|users|all)
    ├─ filter elegibilidad (exclude, snooze, lock ajeno no-stale)
    ├─ sortPendingOffersForModeration + filtro maxLevel
    ├─ preferOfferFirst (deep-link)
    └─ loop ≤40 candidatos: tryAcquireModerationLock → SELECT fresco → return
```

**Superficie UI:** `ModerationFocusWorkspace` — una oferta activa + atajos A/R/S/←/→.  
**No hay** cola multi-item renderizada en Focus; el “batch de ~100” es secuencia de claims en el tiempo.

**Archivos canónicos:**

- `lib/hooks/useModerationFocusQueue.ts`
- `lib/moderation/claimNextModerationOffer.ts`
- `lib/moderation/atomicModerationLock.ts`
- `lib/moderation/moderationLock.ts` (`MODERATION_LOCK_STALE_MS = 5 * 60 * 1000`)
- `lib/moderation/offerClaimEligibility.ts`
- `lib/moderation/releaseStaleLocks.ts`
- `lib/moderation/slaContract.ts` (`CLAIM_QUEUE_HARD_CAP = 1000`)
- `lib/moderation/focusTypes.ts`
- `app/api/admin/moderation/claim-next/route.ts`
- `app/api/admin/moderate-offer/route.ts`
- `app/api/admin/moderation-snooze` (snooze)

---

## 4. CLAIM/LEASE LIFECYCLE

### Mapa de estados (real)

```
                ┌─────────────────────────────────────────────┐
                │              status = pending               │
                │  locked_by null | own | stale → claimable   │
                │  snoozed_until > now → no claimable         │
                └───────────────┬─────────────────────────────┘
                                │ tryAcquire (UPDATE condicional)
                                ▼
                     CLAIMED (lock activo, TTL 5m vía locked_at)
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
     approve/reject          snooze               goNext/skip
     moderate-offer      moderation-snooze      release lock
     status≠pending      snoozed_until set      status sigue pending
     LOCK_CLEAR          release + exclude      exclude ring
          │                     │                     │
          ▼                     ▼                     ▼
     APPROVED/REJECTED    SNOOZED (pending)     SKIPPED (pending)
          │               └─ al expirar snooze ─┘
          │                     vuelve elegible
          │
     (update-offer demote material → pending de nuevo; fuera del claim path)
```

**Lease:** no hay columna `expires_at` dedicada. Expiración = `now - locked_at > 5min` (`isModerationLockStale`). Heartbeat cliente cada **60s** (`postLock('heartbeat')`).

### Transiciones documentadas

| Transición | Actor | Endpoint / fn | Mutación DB | Timestamp | Lease / owner | Concurrencia | Cliente después |
|------------|-------|---------------|-------------|-----------|---------------|--------------|-----------------|
| Bootstrap claim | Moderador | `claim-next` → `claimNextModerationOffer` | `locked_by/at` vía `tryAcquire` | `locked_at=now` | owner = moderator | Un ganador por fila | `setOffer`, history+1, `sessionCursor++`, heartbeat |
| Heartbeat | Cliente | lock API acquire/heartbeat | `locked_at` refresh | now | same owner | Baja (mismo mod) | mantiene lease |
| Approve | Moderador | `POST moderate-offer` status=approved | `status=approved` + clear lock | decisión | requiere lock activo propio | Guard `assertModeratorOwnsLock` | exclude+40; `claimNext(release)` |
| Reject | Moderador | `POST moderate-offer` status=rejected | `status=rejected` + clear lock | decisión | idem | idem | idem |
| Snooze | Moderador | `POST moderation-snooze` | `snoozed_until` + release | ahora+min | liberado | — | exclude; claimNext |
| Skip / goNext (fin history) | Moderador | claim-next + release | clear lock if owner | — | liberado; **status pending** | — | exclude; claimNext |
| goPrev | Cliente only | — | **ninguna** | — | puede quedar sin lock en DB | — | `setOffer(history[i])` snapshot |
| Stale reclaim (system) | claimNext / ops | `releaseStaleModerationLocks` | `locked_by/at=null` | audit `lock_reclaimed_stale` | previo owner perdido | SELECT+UPDATE por ids (no FOR UPDATE) | siguiente claim puede tomar esas filas |
| Stale reclaim (claim) | Moderador B | `tryAcquire` con `locked_at.lt.staleIso` | lock → B | now | B gana si A stale | Atómico en UPDATE | B ve oferta como nueva claim |

**Nota atomicidad claim:** demostrada por **UPDATE condicional + `.select().maybeSingle()`** — si 0 filas, `claimed=false`. No hay `SELECT FOR UPDATE` ni RPC de claim; la atomicidad es la del **UPDATE … WHERE** de Postgres/PostgREST.

**Índice relevante:** `idx_offers_pending_snooze ON (status, snoozed_until NULLS FIRST, created_at) WHERE status=pending` (`offers_moderation_lock_snooze.sql`). **No hay UNIQUE(locked_by)** ni constraint anti-doble-claim más allá del UPDATE filtrado.

---

## 5. PAGINATION MODEL

| Mecanismo | ¿Usado en Focus claim? |
|-----------|------------------------|
| Offset pagination | **No** |
| Cursor / keyset pagination | **No** (solo `ORDER BY created_at ASC LIMIT 1000`) |
| ID pagination | **No** |
| Timestamp cursor cliente | **No** |
| LIMIT hard cap | **Sí** — `CLAIM_QUEUE_HARD_CAP = 1000` |
| Sort en memoria | **Sí** — `sortPendingOffersForModeration` |
| Intentos de acquire | **Sí** — `maxAttempts` default **40** |

**Riesgo clásico OFFSET sobre dataset mutable:** **N/A** para Focus (no hay OFFSET).

**Riesgo real análogo (shifting window):**

- El conjunto candidato = **1000 pending más antiguas por `created_at`**.
- Ofertas pending más nuevas fuera del cap **no entran** hasta que las más viejas salen (approve/reject) o el volumen baja.
- Locks stale liberados **dentro** del cap reaparecen en elegibles → sensación de “aparecieron más” al vaciar.
- Skip no saca del dataset; solo del exclude de 40 → **duplicate/revisit**, no skip permanente de ventana.

---

## 6. CLIENT STATE MODEL

Estado en `useModerationFocusQueue`:

| Estado | Rol | Riesgo de inconsistencia |
|--------|-----|---------------------------|
| `offer` | Oferta actual (autoridad UI, no DB) | goPrev puede mostrar snapshot ya approved/rejected |
| `history` / `historyIndex` | Últimos 30 claims; dedupe al insertar | Navegación atrás ≠ claim fresco |
| `excludeRef` | Ring 40 IDs | Tras 40 skips, IDs re-elegibles en servidor |
| `heldLockIdRef` | Lock que cree tener | Unmount hace release; goPrev no re-acquire automático en history mid |
| `claimInFlightRef` | Anti doble claimNext concurrente | OK mismo cliente |
| `actingRef` | Anti doble approve/reject | OK |
| `sessionCursor` | Contador de claims exitosos de sesión | Alimenta ilusión `position/total` |
| `stats.*` | Del último claim response | Cambia cada claim; no cache SWR |
| `originalUrlRef` | Mapa original URL por id | Limpia en approve |
| Optimistic updates | Parcial en edit/URL write | No marca approved optimista antes del POST |

**Autoridad:** I10 — el servidor exige lock activo en approve/reject (`assertModeratorOwnsLock`). El cliente **no** es autoridad de estado de moderación; sí puede **mostrar** estado stale vía history.

**Tras network failure:** approve falla → offer permanece; claimNext no corre. Retry seguro. Si approve OK y claimNext falla → oferta ya decidida en DB; cliente puede quedar con offer viejo hasta reintento de claim (heldLock ya null).

**AbortController:** no presente en claimNext.

---

## 7. DATABASE QUERY ANALYSIS

### Q1 — Candidate window

```
SELECT … FROM offers
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 1000
```

- Filtros: solo `pending` (no filtra snooze/lock en SQL; se filtra en JS).
- Joins: `public_profiles_view!created_by`.
- Atomicidad: lectura; race con updates concurrentes → snapshot no transaccional con el acquire posterior (mitigado por UPDATE condicional al claim).

### Q2 — tryAcquire (claim atómico)

```
UPDATE offers SET locked_by=:mod, locked_at=:now
WHERE id=:id
  AND status='pending'
  AND (locked_by IS NULL OR locked_by=:mod OR locked_at < :staleIso)
  AND (snoozed_until IS NULL OR snoozed_until <= :now)
RETURNING id
```

- Demuestra exclusión mutua para lease **fresco**.
- Permite reclaim si stale o re-claim del mismo owner.
- **No** `FOR UPDATE` previo; suficiente para “un ganador” en Postgres.

### Q3 — releaseStale

```
SELECT id, locked_by, locked_at FROM offers
WHERE status=pending AND locked_by IS NOT NULL AND locked_at < :staleIso
LIMIT ≤500 (claim usa 100)
→ UPDATE … SET locked null WHERE id IN (…) AND pending AND locked_at < stale
```

- Race: entre SELECT y UPDATE otro heartbeat podría refrescar `locked_at` → UPDATE no toca (filtro `lt stale`) — correcto.
- Race: entre release y acquire de otro — acquire gana con UPDATE; OK.

### Q4 — approve/reject

- SELECT offer + assert lock ownership.
- UPDATE status + `locked_by/at = null`.
- Oferta sale del universo Q1.

### Índices

- `idx_offers_pending_snooze` ayuda backlog pending; claim ordena solo por `created_at` en SQL.

---

## 8. DUPLICATION ANALYSIS

### Prueba mental: `claimNext(); claimNext(); approve(); claimNext()` → `[A,B,C,A]`

| Condición | ¿Posible A otra vez? |
|-----------|----------------------|
| A approved | **No** vía claim (status≠pending) |
| A skipped vía goNext, exclude rotó (>40) | **Sí** |
| A snoozed y expiró | **Sí** |
| A leased, abandonada >5m, stale released | **Sí** (mismo u otro mod) |
| A solo en history + goPrev | **Sí en UI**, no nuevo claim |

Secuencia concurrente dos clientes sobre A fresca: solo uno obtiene `claimed=true`.

### `refresh` / remount

- Remount: nuevo bootstrap `claimNext`; release del unmount del lock anterior; puede claim otra oferta. No duplica dos currents.
- `sourceTab` change: re-bootstrap claimNext.

### Near end of queue

1. `availableEstimate → 0` → `offer=null`, header “Nada pendiente”.
2. Siguiente interacción / remount / claim: `releaseStale` + exclude rotado + nuevo pending → `availableEstimate > 0` → **parece reload**.
3. Contador `Oferta 100 de 100` luego `Oferta 101 de 105` si pending sube.

### IDs en history

Al claim: `prev.filter(id !== claimed.id)` — no dos entradas iguales en history a la vez. Duplicación “de lista” **no**.

---

## 9. RACE CONDITION ANALYSIS

| Race | Resultado |
|------|-----------|
| Mod A y B claim misma fila, locks frescos | Un UPDATE gana; el otro `claimed=false`; loop al siguiente candidato |
| Claim vs approve concurrente | Approve exige lock; si B no tiene lock, falla. Si A aprueba, status≠pending → acquire de B falla |
| Heartbeat A vs releaseStale | Si heartbeat refresca `locked_at` antes del UPDATE stale, release no libera |
| Doble claimNext mismo cliente | `claimInFlightRef` bloquea |
| Approve OK + claimNext lento + user spam | `actingRef` bloquea |
| goPrev a oferta sin lock + Approve | Servidor rechaza (“Debes reclamar…” / lock expiró) — no doble decisión fantasma |
| releaseStale SELECT/UPDATE no transaccional única | Mitigado por predicado `locked_at < stale` en UPDATE |
| maxAttempts=40 vs muchos locks ajenos frescos | Puede devolver `claimed:false` con `availableEstimate>0` (falsos “fin de cola”) → reintento posterior puede claim — sensación de “aparecieron más” |

---

## 10. INVARIANT CHECK

| ID | Invariante | Estado |
|----|------------|--------|
| I1 | Misma oferta no dos veces **simultánea** en Focus | **HOLD** (un `offer`; history dedupe) |
| I2 | Claim activo A no reclamable por B | **HOLD** si no-stale; **BY DESIGN FAIL** si stale |
| I3 | Approved/rejected no vuelven por refresh | **HOLD** (filtro status); excepción demote material |
| I4 | Lease expirado reclaim solo bajo reglas | **HOLD** (staleIso / releaseStale) |
| I5 | Reclaim no duplica items cliente | **HOLD** para current; history puede re-mostrar ID vía goPrev |
| I6 | Refresh+claimNext no dos representaciones current | **HOLD** |
| I7 | Orden prioridad determinista | **HOLD débil**: sort editorial determinista **sobre** snapshot; snapshot SQL no es snapshot TX con acquires |
| I8 | Límite cola = significado código | **HOLD documentado**: cap **candidatos SQL=1000**, no “tamaño de sesión”; UI total ≠ hard cap |
| I9 | Reaparición solo con transición legítima | **HOLD** para skip/snooze/stale/demote; audit parcial (`lock_reclaimed_stale`, outcomes claim) |
| I10 | Cliente no autoridad de estado | **HOLD** en API decisión; UI history puede mentir visualmente |

---

## 11. PRODUCTION EVIDENCE

**Esta pasada:** MCP `plugin-supabase-supabase` en error / sin tools de query. **No** se ejecutaron SELECT de solo lectura en producción.

**Queries recomendadas (ops, read-only) para cerrar UNKNOWN cuantitativo:**

```sql
-- backlog
SELECT status, COUNT(*) FROM offers WHERE status = 'pending' GROUP BY 1;

SELECT COUNT(*) FILTER (WHERE locked_by IS NOT NULL) AS claimed_active,
       COUNT(*) FILTER (WHERE locked_by IS NOT NULL
         AND locked_at < now() - interval '5 minutes') AS claimed_stale
FROM offers WHERE status = 'pending';

-- reclaims recientes
SELECT COUNT(*) FROM moderation_audit
WHERE action = 'lock_reclaimed_stale'
  AND created_at > now() - interval '24 hours';

-- claims repetidos misma oferta mismo día (si outcomes/audit lo registran)
-- ajustar nombre de tabla según writeModerationAudit / outcomes
```

Sin esos números: la clasificación CONFIRMED se basa en **código + tests de simulación concurrente** (`tests/moderation/concurrentClaimSimulation.test.ts`, `atomicModerationLock`), no en conteo live de IDs repetidos en sesión de campo.

---

## 12. SEVERITY

| Dimensión | Nivel | Nota |
|-----------|-------|------|
| Integridad money / approve doble | **Low** | Lock assert + status |
| Experiencia moderador (confianza en cola) | **Medium–High** | Sesiones rápidas (~100/20min) disparan exclude ring + stale + UI total |
| Doble publicación / race claim | **Low** (mitigado) | |
| Pérdida de pending legítimos | **Low–Medium** | Cap 1000 + maxAttempts 40 pueden posponer atención; no borra |

**Severidad global P0.3B:** **Medium** (trust UX / forensic clarity), no incidente de ledger.

---

## 13. REPRODUCTION STEPS

### A — Reaparición legítima tras skips (CONFIRMED por diseño)

1. Abrir Focus Moderation con backlog > 50 pending.
2. Pulsar → (`goNext`) **45 veces** sin approve/reject (o mezclar ~40 skips).
3. Continuar claimNext: ofertas skipped tempranas **pueden** volver como current.
4. Observar mismo `offer.id` otra vez.

### B — “Más ofertas al final”

1. Procesar hasta `claimed:false` / “Nada pendiente” con otros mods idle >5 min en locks.
2. `claimNext` de nuevo (o remount): `releaseStale` libera hasta 100 → nuevas elegibles.
3. Ver `Oferta N de M` con M creciente vía `max(pending, available, position)`.

### C — Apariencia sin claim nuevo

1. Aprobar varias ofertas.
2. Flecha ← (`goPrev`): ofertas ya decididas reaparecen en UI desde history.

### D — Doble claim activo (esperado NOT_REPRODUCED)

1. Dos sesiones, misma oferta elegible #1.
2. Claim simultáneo: una gana; la otra recibe otra oferta o vacío.
3. Verificar DB: un solo `locked_by` no-stale.

---

## 14. RECOMMENDED FIX

**No implementar en P0.3B.** Dirección arquitectónica sugerida para P0 siguiente:

1. **Separar semántica skip vs decide:** skip explícito con política (¿vuelve al final con `snoozed_until` corto / flag `skipped_until`?) en lugar de solo exclude ring de 40.
2. **Ampliar o persistir exclude de sesión** en servidor (tabla `moderation_session_exclusions` o claim token) para la sesión del moderador — o documentar UX “puedes volver a ver skips”.
3. **UI counter:** mostrar `sessionCursor` y `availableEstimate` por separado; no `max(...)` que infla “de N”.
4. **goPrev:** o bien read-only badge “ya decidida / sin lock”, o re-claim obligatorio antes de actuar.
5. **Observabilidad:** log estructurado por claim `{offer_id, moderator_id, claimed_at, exclude_hit, reclaim_stale}`.
6. **Hard cap:** telemetría `pending_total - candidate_window` para ver ciegos fuera de 1000.

---

## 15. TEST PLAN

Existentes útiles (no modifican prod):

- `tests/moderation/concurrentClaimSimulation.test.ts` — exclusión mutua + reclaim stale.
- `tests/moderation/moderationOsPhase1.test.ts` — tryAcquire / releaseStale.
- `tests/moderation/releaseStaleLocks.test.ts`.

**Añadir en P0 fix (no ahora):**

- Test unitario: exclude ring 40 → 41er skip permite re-elegir primer ID en filtro `isOfferClaimEligible`.
- Test integración mock: goNext no cambia status; claimNext puede devolver mismo id tras dropear exclude.
- Test UI/contract: `total` no debe usar `max(position, pending)` si se redefine semántica.

Ejecución en esta auditoría: **no requerida** para el veredicto de código; tests de claim ya cubren atomicidad.

---

## 16. EXACT NEXT P0

**P0.3C — Focus Queue session integrity (fix UX + optional server exclude)**

Alcance mínimo:

1. Corregir semántica del contador `position/total`.
2. Decidir política de **skip** (requeue delay vs exclude sesión persistente).
3. Badge/estado en `goPrev` (snapshot vs live claim).
4. Telemetría claim/reclaim/exclude-hit (read path + audit).
5. Dashboard ops: pending vs locked vs stale vs outside hard-cap.

**Fuera de alcance P0.3C:** money, ledger, bank_coupon, segunda cola, Supply WRITE, autoApprove.

---

## Respuestas de éxito

### ¿Por qué una oferta parece reaparecer cuando el moderador llega al final de la cola?

Porque el “final” es **estimado y mutable**: cada `claimNext` puede liberar leases stale, el exclude cliente solo recuerda 40 IDs (los skips siguen `pending`), el contador UI puede **crecer** con `max(pending, available, sessionCursor)`, y ← re-muestra history. No hace falta un bug de OFFSET.

### ¿Puede ocurrir una duplicación real de claim en producción?

**Claim activo concurrente (dos owners frescos):** no — UPDATE condicional.  
**Re-claim de la misma oferta pending:** sí — skip+exclude, snooze expiry, o lease >5 min.

---

## DETENTE

Auditoría completa. **Sin implementación de fix.**  
Artefacto: `docs/SYSTEMS/AUDIT_moderation_focus_queue_p03b.md`.

---

## P0.3C RESOLUTION (2026-09-16)

Implementado en `MODERATION_SESSION_SEMANTICS.md` + código.

| Hallazgo P0.3B | Mitigación P0.3C |
|----------------|------------------|
| exclude ring `slice(-40)` | `skippedIds`/`actionedIds` FIFO cap 2000 + sessionStorage |
| Contador `max(pending, available, cursor)` | `{N} revisadas · {M} pendientes` |
| goPrev sin etiqueta | Badge **Historial**; acciones deshabilitadas |
| Stale reclaim silencioso | `claimKind: stale_reclaim` + telemetría + “recuperada” |
| Skip ≡ exclude corto | Política `SKIPPED_THIS_SESSION` explícita (no reject) |

**QUEUE_DUPLICATION (accidental in-session):** mitigado por diseño de sesión.  
**Double fresh claim:** sigue NOT_REPRODUCED (sin cambio de atomicidad).

Ver tests: `tests/moderation/sessionIntegrity.p03c.test.ts`.
