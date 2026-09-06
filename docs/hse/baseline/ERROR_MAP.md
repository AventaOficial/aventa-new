# Error Map — CONTROL

**Evidence:** E3  
Formato: ACTION → ERROR → FEEDBACK → RECOVERY → FINAL STATE

---

## Auth / sesión

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| Acceder `/me*` `/settings` sin sesión | Middleware redirect | Navega a `/` | Login modal manual | Home anon |
| Voto en OfferCard sin sesión | No API | Toast «Inicia sesión para votar…» | Abrir auth | Sin voto |
| Voto en detalle sin sesión | No API | **Silent** `return` | UNKNOWN (usuario debe descubrir auth) | Sin voto |
| Fav OfferCard sin sesión | No API | `router.push('/')` | — | Home |
| Fav Featured/Detail sin sesión | No API | Silent | — | Sin cambio |
| Publicar sin sesión | Gate UI | `openRegisterModal('signup')` | Completar auth | Modal auth |
| Plaza write sin sesión | Gate UI | `openRegisterModal('signup')` | Auth | — |
| API con Bearer inválido (voto) | 401 | Toast mensaje sesión | Re-login | Sin cambio persistente |
| OAuth `?error=` en Home | OAuth fail | Toast + limpia query | Reintentar auth | Home |

---

## Feed / discovery

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| Cargar feed | Fetch fail | `notifyUserError` + toast + UI Reintentar | Click reintentar | Feed o sigue error |
| Búsqueda | Fail query | Toast error | Reintentar / limpiar search | — |
| Oferta no trackable view | 204 silencio | Ninguno | — | Sin event |

---

## Detalle

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| Abrir `/oferta/[id]` inválida/expirada/no approved | `notFound` / redirect | Página not found Next | Volver | Exit task |
| Outbound track fail | catch en client | Abre URL sin clickId | — | Degraded success |
| Outbound sin URL | early return | Ninguno | — | No open |

---

## Voto

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| POST `/api/votes` | 403 (status/expiry/rules) | `result.message` toast (card) | — | Revert UI path |
| | 429 | Toast rate limit | Esperar | — |
| | 5xx / network | Toast servicio/reintenta | Retry click | — |

---

## Favorito

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| insert/delete fail | Supabase error | Rollback a `wasFavorite` (`applyFavoriteToggle`) | Retry | Estado previo |
| Unique 23505 en insert | Tratado ok | Mantiene favorito | — | Favorito true |
| Cargar `/me/favorites` | Query error | Toast notifyUserError | Retry navigate | Error UI |

---

## Comentarios

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| POST sin auth | UI disabled / API 401 | UNKNOWN copy exacto sin runtime | Auth | — |
| POST fail | Error path en OfferPageContent | Toast/notify (código presente) | Retry | — |

---

## Publicación

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| parse-offer-url fail | API error | Feedback en modal (E3 existencia; copy exacto UNKNOWN sin UI walkthrough) | Continuar sin enlace / corregir | Gate |
| upload image fail | API | Error en flujo upload | Reintentar imagen | — |
| POST `/api/offers` 400 | Validación | JSON error → UI | Corregir campos | Form |
| 409 duplicate | Dedupe | Error duplicate_offer_id | Salir / ver existente | No create |
| cooldown / 429 | Rate/cooldown | Mensaje / status endpoint | Esperar | — |
| 500 | Server | Error genérico | Retry | — |

---

## Ban / me APIs

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| `/api/me/*` con ban | Fail-closed auth (requireMeUser) | 403/401 según ruta | UNKNOWN UX exacta | Bloqueado |

Detalle mensaje UI: UNKNOWN sin inventario de todos los consumers.

---

## Sesión expira mid-task

| ACTION | ERROR | FEEDBACK | RECOVERY | FINAL |
|---|---|---|---|---|
| Voto con token stale | 401 | Toast sesión caducada | Re-login | — |
| Middleware path | Redirect `/` | — | Login | Home |

---

## Friction potenciales (sin F0–F5 asignado)

Solo hechos de implementación:

1. Auth gates **inconsistentes** entre OfferCard (toast/redirect) vs detalle (silent) para voto/fav.  
2. Outbound degrada silenciosamente si track falla.  
3. Comparar ofertas requiere multi-navegación (no UI compare).  
4. OfferModal detallado existe pero no está cableado → posibles expectativas de código muerto.  
5. Tab Plaza ausente en móvil ActionBar.
