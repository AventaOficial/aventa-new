# Interaction Map — CONTROL

**Evidence:** E3  
**Distinción:** solo **IMPLEMENTED INTERACTION** (código).  
**OBSERVED USER INTERACTION:** no documentado (sin E4).

Códigos alineados a [../RESEARCH_PROTOCOL.md](../RESEARCH_PROTOCOL.md) / métricas HSE.

---

## Catálogo implementado

| Código | Dónde (E3) | Notas |
|---|---|---|
| INT-CLICK / INT-TAP | Cards, botones voto/fav/CTA, ActionBar, tabs | Touch vs mouse no ramificado en handlers distintos |
| INT-HOVER | Estilos CSS posibles | Comportamiento hover-only crítico: UNKNOWN sin auditoría visual completa |
| INT-SCROLL | Feed Home, detalle, listas | View tracking usa IntersectionObserver en OfferCard |
| INT-SWIPE | UNKNOWN (no gesto dedicado encontrado) | — |
| INT-FOCUS | Controles nativos / modales | Focus trap detallado: UNKNOWN |
| INT-INPUT | Auth modal, upload form, comentarios, search, settings | — |
| INT-SEARCH | Home `SearchField` → query Supabase ranked | — |
| INT-SELECT | Tabs viewMode, timeFilter, categoría chips | — |
| INT-FILTER | Categoría, tienda (xl), timeFilter, Para ti | — |
| INT-MODAL-OPEN | Register/upload/report/share menus | OfferModal detalle: **código existe, no montado** |
| INT-NAV | `router.push` / links ActionBar / categorías | — |
| INT-BACK | Browser back / links | No handler custom global |
| INT-SUBMIT | Auth, upload, comments, settings forms | — |
| INT-VOTE | OfferCard, OfferPageContent | API `/api/votes` |
| INT-FAV | OfferCard, FeaturedOfferCard, OfferPageContent, me/favorites | Supabase directo |
| INT-COMMENT | OfferPageContent | APIs comments |
| INT-OUTBOUND | OfferPageContent CTA | `trackAndOpenOfferUrl` |
| INT-ERROR | Toasts, silent returns, HTTP errors | — |
| INT-RETRY | Botón Reintentar feed; re-click voto/fav | — |
| INT-ABANDON | No evento first-party dedicado | Abandono = inferencia futura (no E3 como evento) |

---

## Emisores de eventos first-party (interacción → telemetría)

| Interacción | Evento sistema |
|---|---|
| Card visible (IO) | `POST /api/track-view` → `view` |
| CTA «Ver oferta» card | `POST /api/events` `cazar_cta` |
| Share | `POST /api/events` `share` |
| Outbound CTA | `POST /api/track-outbound` → `outbound` (+ rewards clickId) |
| Vote success (client log) | `logEvent` type `vote` (si remote enabled) |

Ver [TELEMETRY_BASELINE.md](./TELEMETRY_BASELINE.md).

---

## Registro futuro

```text
interaction_code | screen | task_id | implemented: yes | user_observed: no (HSE-01)
```
