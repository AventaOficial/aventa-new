# Cazar Ofertas Analysis — AVENTA CONTROL

**Evidence:** E3 (código) salvo UNKNOWN  
**Prioridad HSE-03**

---

## Resumen ejecutivo

En AVENTA, la palabra **«Cazar»** aparece en varios significados distintos:

| Significado | Qué es realmente (E3) |
|---|---|
| A. Telemetría `cazar_cta` | Click en CTA de card («Ver oferta») → evento, no caza humana |
| B. Publicar oferta | ActionBar «Subir», extensión «Cazar oferta», mensaje «Gracias por cazar…» |
| C. Plaza / solicitudes | Expresar demanda («qué quiero cazar») + CTA «Ayudar a cazar» → upload |
| D. Admin Hunter | Bot ingest automatizado — **no** responde solicitudes humanas |

**No existe** ruta `/cazar`.  
El loop completo **demanda → cazador → respuesta estructurada → validación → outcome** está **PARTIAL / roto** en el eslabón de respuesta.

---

## 1. ¿Dónde existe «Cazar»?

| Lugar | Observación | Path |
|---|---|---|
| Onboarding | Paso título «Cazar» | `OnboardingV1.tsx` |
| Extensión | Nombre/botón «Cazar oferta» | `browser-extension/*`, `/extension` |
| OfferCard | CTA UI = «Ver oferta»; evento `cazar_cta`; copy rechazo menciona «Cazar oferta» | `OfferCard.tsx` |
| ActionBar | CTA = «Subir» / «Subir oferta»; post-upload «cazar una oferta» | `ActionBar.tsx` |
| Plaza | Copy «Pide lo que quieres cazar»; botón «Ayudar a cazar» | `plaza/page.tsx` |
| Rail home | «Ayudar a cazar» | `RailOfferRequests.tsx` |
| Descubre | Copy marketing «cazar» | `descubre/*` |
| Métricas creador | `cazarClicks` = conteo `cazar_cta` | `/api/me/offer-metrics` |
| Admin `/admin/hunter` | Pipeline bot | `admin/hunter/page.tsx` |

---

## 2–5. Rutas, componentes, APIs, tablas

### Rutas

| Ruta | Rol |
|---|---|
| `/plaza` | Solicitudes / Conversaciones / Avisos |
| `/` + `?upload=1&title=` | Prefill upload («Ayudar a cazar») |
| `/subir` | Redirect a upload |
| `/extension` | Flujo extensión |
| `/admin/hunter` | Bot ingest |
| `/cazar` | **MISSING** |

### Componentes

`plaza/page.tsx`, `RailOfferRequests`, `HomeDesktopRail`/`HomeSponsored`, ActionBar upload, OfferCard CTA, extensión popup.

### APIs

| API | Métodos | Tabla |
|---|---|---|
| `/api/plaza/requests` | GET approved; POST pending | `plaza_requests` |
| `/api/plaza/discussions` | GET approved; POST pending | `plaza_discussions` |
| `/api/events` | `cazar_cta` | `offer_events` |
| `/api/offers` | Publish oferta | `offers` |
| Reply/match/notify plaza | **MISSING** | — |

### Tablas (migración `docs/supabase-migrations/plaza_aventa.sql`)

**plaza_requests:** id, user_id, title, details, budget_max, preferred_store, status (`pending|approved|closed`), created_at  
**plaza_discussions:** id, user_id, title, body, status (`pending|approved|hidden`), created_at  

RLS: SELECT approved (o propio); INSERT propio; **sin UPDATE/DELETE policies** en repo.  
**UNKNOWN:** si tablas están aplicadas en Production.

---

## 6–7. Estados y capacidades usuario

### Estados solicitud

- API POST fija `status: 'pending'` + `needsModeration: true`.  
- GET lista solo `status = 'approved'`.  
- DEFAULT SQL de columna = `'approved'` (desalineado con API).  
- **MISSING:** UI/API admin para aprobar Plaza.

### Usuario puede (E3)

- Crear solicitud (auth): title + details (budget/store aceptados por API pero **form Plaza no los envía**).  
- Ver solicitudes **aprobadas**.  
- Crear conversación (talk).  
- Ver avisos.  
- Pulsar «Ayudar a cazar» → abrir upload con título prefills (**sin `request_id`**).  
- Publicar oferta genérica / usar extensión.

### Usuario no puede (MISSING)

- Responder solicitud con mensaje estructurado.  
- Vincular oferta a solicitud.  
- Ver matching.  
- Recibir notificación de respuesta.  
- Marcar solicitud fulfilled/closed desde UI.  
- Moderación Plaza desde admin del repo.

---

## 8–9. ¿Qué puede hacer un «cazador»?

| Tipo | Capacidad |
|---|---|
| Humano (comunidad) | Subir oferta (mismo flujo publish); opcionalmente desde CTA Plaza |
| Trusted hunter | Whitelist moderación ofertas — **no** Plaza |
| Admin Hunter bot | Ingest ML/Amazon — **no** demanda Plaza |

No hay rol «hunter» ligado a `plaza_requests`.

---

## 10–15. Solicitud: qué es / quién / respuesta / notificación

| Pregunta | Respuesta E3 |
|---|---|
| ¿Qué es? | Fila en `plaza_requests` (pedido de oferta) |
| ¿Quién crea? | Usuario autenticado community |
| ¿Info? | title, details; budget/store opcionales en API |
| ¿Quién ve? | Público: solo approved; autor: propio vía RLS (si no service_role) — API GET usa service_role y filtra approved |
| ¿Quién responde? | Nadie vía API; workaround = subir oferta |
| ¿Cómo responde? | No estructurado |
| ¿Tras responder? | N/A |
| ¿Notifica? | **MISSING** |

---

## 16–19. Matching, seguimiento, resolución, implementado

| Pieza | Clasificación |
|---|---|
| Crear/listar solicitudes | PARTIAL |
| Crear/listar discusiones | PARTIAL |
| Rail home | IMPLEMENTED (desktop) |
| Prefill upload | PARTIAL (sin vínculo formal) |
| Moderación approve | MISSING |
| Respuestas / matching / resolución | MISSING |
| Notificaciones | MISSING |
| `cazar_cta` telemetry | IMPLEMENTED |
| Extensión publish | IMPLEMENTED |
| Bot hunter | IMPLEMENTED (otro dominio) |
| Fase 2 doc completa | PARTIAL vs código; registry dice «sin implementar» (desactualizado) |

---

## 20–25. UI-only / backend / futuro

| Parte | Tipo |
|---|---|
| Label «Cazar» en onboarding/extensión | Marca/copy |
| CTA card «Ver oferta» + evento cazar_cta | Backend telemetría + UI |
| Plaza forms | UI + backend mínimo |
| Approve/moderation Plaza | Futuro / ops manual UNKNOWN |
| request_responses (doc Fase 2) | Futuro no implementado |
| Rewards por cazar solicitud | Futuro — **no analizar implementación** |

---

## Modelo demand loop (existencia real)

```text
USER → REQUEST (pending) → [MODERATION MISSING] → APPROVED LIST
                                      ↓
                         «Ayudar a cazar» → UPLOAD OFFER (no link)
                                      ↓
                         VALIDATION / RESPONSE / OUTCOME → MISSING
```

| Etapa | Status |
|---|---|
| USER | CURRENT |
| REQUEST | PARTIAL |
| HUNTERS/COMMUNITY | PARTIAL (publish genérico) |
| CANDIDATE OFFER | PARTIAL (sin vínculo) |
| VALIDATION | MISSING (para request) |
| RESPONSE | MISSING |
| OUTCOME | MISSING |

---

## Hipótesis de producto (NO aceptar como verdad)

> «AVENTA no solo muestra ofertas; permite expresar qué se busca y recibir ayuda.»

| Evaluación | Resultado |
|---|---|
| Intención en copy Plaza | DOCUMENTED en UI |
| Capacidad end-to-end | **No demostrada** — loop incompleto (E3) |
| Problema potencial | Demanda explícita vs supply-side feed (HYPOTHESIS) |
| Alternativas actuales | Grupos FB/WA, alertas keyword Promodescuentos, búsqueda ML/Amazon (DOCUMENTED/INFERRED) |
| Incentivos | UNKNOWN / HYPOTHESIS |
| Riesgos spam/calidad | HYPOTHESIS (alta en sistemas abiertos de requests) |

---

## Preguntas abiertas (Cazar)

1. ¿Hay moderación Plaza fuera del repo (SQL manual)? UNKNOWN.  
2. ¿Production tiene filas approved? No consultado en HSE-03 (read-only opcional no ejecutado aquí).  
3. ¿Se unificará semántica «Cazar» (publish vs CTA vs demanda)? HYPOTHESIS de claridad.
