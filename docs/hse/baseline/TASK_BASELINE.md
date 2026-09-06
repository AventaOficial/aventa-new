# Task Baseline — TASK-001 … TASK-015

**Evidence:** E3 unless marked UNKNOWN  
**OBSERVED TIME:** UNKNOWN (todas)  
**Fuente de IDs:** [../TASK_CATALOG.md](../TASK_CATALOG.md)

Leyenda outcome: SUCCESS / FAILURE / EXIT según definición de catálogo + implementación.

---

## TASK-001 — Encontrar una oferta interesante

| Campo | Valor |
|---|---|
| ENTRY | `/` |
| Precondiciones | App cargada; feed o vacío |
| Pasos reales | Cargar feed (`/api/feed/home` o búsqueda) → scroll/tabs → fijar atención en card |
| Componentes | `page.tsx`, `OfferCard`, `FeaturedOfferCard`, `Hero` |
| Rutas | `/` |
| Acciones | scroll, tab, search, click card |
| Resultado esperado | Usuario identifica candidato (proxy sistema: click card / cazar_cta / fav / outbound posterior) |
| Errores | Feed fail → toast + Reintentar; feed vacío → UNKNOWN percepción |
| Salidas / abandono | Navigate away; bounce |
| OBSERVED TIME | UNKNOWN |
| Evidence | E3 |

**Graph:** `HOME → [SCROLL|TAB|SEARCH] → CARD_ATTENTION → SUCCESS|EXIT`

---

## TASK-002 — Categoría específica

| Campo | Valor |
|---|---|
| ENTRY | `/` chips vitales **o** `/categoria/[slug]` (/subslug) |
| Precondiciones | Categoría existente |
| Pasos | Elegir categoría/filtro → ver listado → seleccionar |
| Componentes | filtros Home; páginas categoría |
| Errores | Categoría sin ofertas → UI vacía (detalle copy: UNKNOWN sin runtime) |
| Graph | `ENTRY → CATEGORY_FILTER → RESULTS → CARD → SUCCESS|EXIT` |
| Evidence | E3 |

---

## TASK-003 — Evaluar si vale la pena

| Campo | Valor |
|---|---|
| ENTRY | Card visible o `/oferta/[id]` |
| Pasos | Leer precio/descuento/tienda/votos/texto/comentarios; opcional price insight API |
| Componentes | `OfferCard` (parcial), `OfferPageContent` |
| Resultado | Juicio usuario — **no persistido** como “vale/no vale” |
| Graph | `OFFER_CONTEXT → READ_INFO → JUDGEMENT(internal) → SUCCESS(defined by study)|EXIT` |
| Evidence | E3 (info disponible); juicio = UNKNOWN sin E4 |

---

## TASK-004 — Abrir detalles

| Campo | Valor |
|---|---|
| ENTRY | Card en listado |
| Pasos | Click card o CTA «Ver oferta» → `/oferta/[id]` |
| Sistema | Server valida approved + no expirada; else `notFound`/redirect |
| Graph | `CARD → NAV /oferta/[id] → DETAIL_LOADED → SUCCESS \| NOT_FOUND` |
| Evidence | E3 |

---

## TASK-005 — Comparar dos ofertas

| Campo | Valor |
|---|---|
| ENTRY | ≥2 ofertas en feed/listas |
| Pasos reales | Abrir oferta A → back/nav → oferta B (no UI “comparar lado a lado”) |
| Componentes | navegación Next + dos instancias detalle |
| Graph | `A_DETAIL ↔ NAV ↔ B_DETAIL → PREFERENCE(internal)` |
| Evidence | E3 (no hay compare UI dedicada) |

**POTENTIAL FRICTION POINT:** requiere memoria/navegación entre rutas (hecho de arquitectura).

---

## TASK-006 — Outbound a tienda

| Campo | Valor |
|---|---|
| ENTRY | `/oferta/[id]` con `offerUrl` |
| Pasos | CTA → `trackAndOpenOfferUrl` → `POST /api/track-outbound` → `window.open` |
| Auth | Opcional (Bearer si hay sesión) |
| Errores | Track fail → aún abre URL sin clickId; sin URL → no-op |
| Graph | `DETAIL → OUTBOUND_CTA → TRACK → WINDOW_OPEN → SUCCESS\|DEGRADED` |
| Evidence | E3 |

---

## TASK-007 — Favorito

| Campo | Valor |
|---|---|
| ENTRY | Card / featured / detalle / `/me/favorites` |
| Pasos | Toggle `applyFavoriteToggle` → insert/delete `offer_favorites` |
| Auth | Card: sin sesión → `router.push('/')`; detalle/featured: silent return |
| Lista | `/me/favorites` (middleware) |
| Graph | `UI → TOGGLE → SUPABASE → UI_STATE → SUCCESS\|ROLLBACK` |
| Evidence | E3 |

---

## TASK-008 — Votar

| Campo | Valor |
|---|---|
| ENTRY | Card o detalle |
| Pasos | `postOfferVote` → `POST /api/votes` |
| Auth | Card: toast si no sesión; detalle: silent; API 401 |
| Server gates | oferta status/expiry → 403 (código votos) |
| Graph | `VOTE_CTRL → API → UI_UPDATE\|TOAST → SUCCESS\|FAIL` |
| Evidence | E3 |

---

## TASK-009 — Comentar

| Campo | Valor |
|---|---|
| ENTRY | `/oferta/[id]` sección comentarios |
| Pasos | GET list; POST create (Bearer); like/report comment APIs |
| Auth | Input disabled sin sesión (OfferPageContent) |
| Graph | `COMMENTS → INPUT → POST → LIST_REFRESH → SUCCESS\|ERROR` |
| Evidence | E3 |

---

## TASK-010 — Publicar

| Campo | Valor |
|---|---|
| ENTRY | ActionBar Subir / `/?upload=1` / `/subir` |
| Pasos | Gate URL parse → form → upload images → `POST /api/offers` |
| Auth | Register modal si no sesión |
| Errores | 400 validación, 409 duplicate, 429 cooldown/rate, 500 |
| Graph | `UPLOAD_ENTRY → GATE → FORM → POST → CREATED\|ERROR` |
| Evidence | E3 |

---

## TASK-011 — Estado oferta propia

| Campo | Valor |
|---|---|
| ENTRY | `/me` (auth) |
| Pasos | Ver listado ofertas propias / estados en UI me |
| Detalle fino de labels | UNKNOWN sin walkthrough runtime de todos los estados |
| Graph | ` /me → OWN_OFFERS_LIST → READ_STATUS → SUCCESS\|EXIT` |
| Evidence | E3 (ruta existe); completitud UI = parcial UNKNOWN |

---

## TASK-012 — Reencontrar oferta vista

| Campo | Valor |
|---|---|
| ENTRY | Favoritos `/me/favorites`, scroll feed, URL, perfil |
| Pasos | Depende de estrategia usuario; historial dedicado = **no encontrado** en rutas consumidor |
| Graph | `STRATEGY{FAV\|SCROLL\|URL\|PROFILE} → LOCATE → SUCCESS\|FAIL` |
| Evidence | E3 |

**POTENTIAL FRICTION POINT:** reorder/expiry pueden impedir reencuentro (estados de oferta).

---

## TASK-013 — Usuario recurrente

| Campo | Valor |
|---|---|
| ENTRY | `/` autenticado; tab `personalized` disponible |
| Pasos | Habitos sobre CONTROL (Para ti, favoritos, me) |
| Medición eficiencia vs novato | UNKNOWN (sin tiempos) |
| Evidence | E3 (capacidades); comportamiento = E1/UNKNOWN |

---

## TASK-014 — Móvil

| Campo | Valor |
|---|---|
| ENTRY | Viewport &lt; md |
| Diferencias | Tabbar sin Plaza; search en Hero; upload steps |
| Tarea ancla | Cualquiera de 001/006/007 sobre layout móvil |
| Evidence | E3 |

---

## TASK-015 — Desktop

| Campo | Valor |
|---|---|
| ENTRY | Viewport md+ |
| Diferencias | Sidebar + Plaza; search sticky; rail xl |
| Evidence | E3 |

---

## Baseline table (plantilla; valores de corrida = futuro)

| TASK-ID | USER | ENTRY | STEP | SCREEN | ACTION | INT TYPE | DECISION | SYSTEM RESPONSE | ERROR PATH | RECOVERY | OUTCOME | EVIDENCE | NOTES |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 001–015 | * | see above | UNKNOWN until run | … | … | IMPLEMENTED only | see DECISION_MAP | … | see ERROR_MAP | … | UNKNOWN | E3 structure | OBSERVED TIME=UNKNOWN |

Filas de corrida humana/simulada **no inventadas** en HSE-01.
