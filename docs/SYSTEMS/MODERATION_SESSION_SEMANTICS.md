# SYSTEM — Moderation Session Semantics (P0.3C)

**Fecha:** 2026-09-16  
**Relacionado:** `AUDIT_moderation_focus_queue_p03b.md`, `SYSTEM_moderation.md`

## Vocabulario

| Término | Significado | Autoridad |
|---------|-------------|-----------|
| **CLAIMED** | Lease activo (`locked_by` + `locked_at` fresco) | **Servidor** |
| **SEEN** | Oferta ya mostrada/claimada en esta sesión de pestaña | Cliente (sessionStorage) + contador |
| **SKIPPED** | `goNext` sin approve/reject/snooze; oferta sigue `pending` | Cliente sesión (exclude) |
| **ACTIONED** | approve / reject / snooze en esta sesión | Servidor (status/snooze) + exclude sesión para snooze |
| **STALE_RECLAIM** | Claim tras lease >5 min de otro moderador | Servidor (`claimKind`) |
| **FRESH** | Claim sin lock previo relevante | Servidor |
| **Historial** | Navegación `goPrev` sobre snapshots locales | Cliente (no crea claim) |

## Autoridad

**SERVER AUTHORITATIVE**

- claim / lease / approve / reject / snooze
- elegibilidad real (`status`, lock, snooze)
- atomicidad de claim (`UPDATE` condicional)

**CLIENT SESSION STATE**

- `sessionId`, `skippedIds`, `actionedIds`, `reviewedCount`
- history stack (últimos 30)
- UI “Historial” / contador de sesión

El cliente **nunca** decide si una oferta está disponible: solo envía `excludeOfferIds` como filtro de preferencia de sesión. El servidor aplica el filtro y el acquire atómico.

## Política de skip

`SKIPPED_THIS_SESSION`:

- **No** es reject.
- **No** es approve.
- **No** muta la fila de oferta (salvo release del lock propio).
- Queda en `skippedIds` (FIFO cap **2000**).
- Se envía en `excludeOfferIds` en cada `claim-next`.
- No reaparece en la misma sesión mientras esté en el exclude (salvo overflow del cap en sesiones extremas).

## Por qué no hay tabla nueva

Para cientos/miles de ofertas por sesión basta:

1. Status en DB para actioned terminal (approve/reject).
2. `snoozed_until` en DB para snooze corto.
3. Exclude acotado en **sessionStorage** (sobrevive refresh de pestaña; muere al cerrar pestaña).

Escala a 100k pending del sistema porque el cliente **no** carga el backlog: el servidor sigue con `LIMIT 1000` + sort. El exclude es O(actividad de sesión), no O(pending global).

Aumentar `40 → 100` hubiera sido un parche; el modelo es **mark tipado + cap 2000 + persistencia de pestaña**.

## Contador UI

Antes (engañoso): `Oferta {sessionCursor} de max(pending, available, cursor)`.

Ahora: **`{N} revisadas · {M} pendientes`**  
(+ prefijo/badge **Historial** si `goPrev`).

`M` = `globalPending` del último claim (conteo servidor). No se inventa un “total de cola estable”.

## claimKind

Respuesta de `claim-next`:

- `fresh`
- `stale_reclaim` (UI discreta: “recuperada”)
- `reclaim_own`

Telemetría: `console.info('[moderation-session]', …)` + outcomes `extras.claim_kind` + audit en stale_reclaim.

## goPrev

- Solo mueve `historyIndex` / snapshot.
- **No** llama `claim-next`.
- Deshabilita approve/reject/snooze mientras `viewingHistory`.
- Badge **Historial**.

## Invariantes (I1–I10)

Ver checklist en `AUDIT_moderation_focus_queue_p03b.md` sección actualizada P0.3C.

## Archivos

| Pieza | Path |
|-------|------|
| Estado puro | `lib/moderation/moderationSessionState.ts` |
| Persistencia | `lib/moderation/moderationSessionStorage.ts` |
| Telemetría | `lib/moderation/focusSessionTelemetry.ts` |
| Hook | `lib/hooks/useModerationFocusQueue.ts` |
| Claim | `lib/moderation/claimNextModerationOffer.ts` |
| Route | `app/api/admin/moderation/claim-next/route.ts` |
| UI | `app/components/moderation/ModerationFocusWorkspace.tsx` |
| Tests | `tests/moderation/sessionIntegrity.p03c.test.ts` |
