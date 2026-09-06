# Journey Map — CONTROL

**Evidence:** E3  
**Modelo:** ENTRY → DISCOVERY → EVALUATION → DECISION → ACTION → OUTCOME

---

## ENTRY

| Campo | Hecho |
|---|---|
| Pantalla | `/` (Home) u otra ruta pública; deep link `/oferta/[id]` |
| Componente | `ClientLayout`, `Hero`, `ActionBar`, auth modal si se abre |
| Acción | Cargar app; opcional login/register |
| Información | Marca, nav, feed o contenido de ruta |
| Decisión | ¿Explorar anónimo? ¿Abrir auth? ¿Ir a Guía/Plaza/Subir? |
| Resultado | Sesión anon o autenticada |
| Siguiente | DISCOVERY (o DETAIL si deep link) |

---

## DISCOVERY

| Campo | Hecho |
|---|---|
| Pantalla | `/`, `/categoria/*`, `/tag/*`, `/tienda/*`, `/descubre`, `/plaza`, `/u/[username]` |
| Componente | `OfferCard` / `FeaturedOfferCard` / listados categoría |
| Acción | Scroll, tabs (`vitales|top|latest|personalized`), search, filtros categoría/tienda/tiempo |
| Información | Cards: título, precio, descuento, imagen, tienda, votos (según props) |
| Decisión | ¿Qué card mirar? ¿Cambiar tab/filtro/búsqueda? |
| Resultado | Conjunto de candidatos visibles |
| Siguiente | EVALUATION (abrir detalle) o abandono |

**Nota:** Click en card → navegación a `/oferta/[id]` (no modal montado).

---

## EVALUATION

| Campo | Hecho |
|---|---|
| Pantalla | `/oferta/[id]` |
| Componente | `OfferPageContent` |
| Acción | Leer detalle, scroll imágenes, price insight si presente |
| Información | Precio, original, tienda, autor, votos, texto, condiciones/cupones si hay, comentarios |
| Decisión | ¿Vale la pena? ¿Necesito más info? |
| Resultado | Juicio interno del usuario (no medido en sistema) |
| Siguiente | DECISION |

---

## DECISION

| Campo | Hecho |
|---|---|
| Pantalla | Detalle (o card para voto/fav sin abrir detalle) |
| Acciones disponibles | Favorito, voto, comentar, compartir, reportar, outbound, volver |
| Información | Señales de precio/social/tienda visibles en UI |
| Decisión | Qué acción tomar o salir |
| Siguiente | ACTION o OUTCOME (abandono) |

---

## ACTION

| Acción | Implementación (E3) |
|---|---|
| Outbound | `trackAndOpenOfferUrl` → `POST /api/track-outbound` → `window.open` |
| Favorito | `applyFavoriteToggle` → Supabase `offer_favorites` |
| Voto | `postOfferVote` → `POST /api/votes` |
| Comentario | `POST /api/offers/[id]/comments` |
| Share | UI share + `POST /api/events` `share` |
| Report | `POST /api/reports` |
| Publicar | flujo ActionBar → `POST /api/offers` |
| Ver detalle desde card | `POST /api/events` `cazar_cta` + `router.push` |

---

## OUTCOME

| Tipo | Cómo se manifiesta en sistema |
|---|---|
| Success (tarea) | Depende de TASK (p. ej. outbound abierto, voto 200, oferta creada) |
| Failure | Toast / silent return / 4xx/5xx / `notFound` |
| Exit/abandon | Navegación away; cierre; sin evento de abandono dedicado (**UNKNOWN** si el usuario “abandonó” vs cambió de tarea) |

---

## Grafo resumido (CONTROL vivo)

```text
START (/)
  → [tabs|search|filters|scroll]
  → OfferCard
  → (cazar_cta + NAV) /oferta/[id]
  → EVALUATION (OfferPageContent)
  → { FAV | VOTE | COMMENT | SHARE | REPORT | OUTBOUND | BACK }
  → SUCCESS | ERROR+feedback | EXIT

Alt ENTRY: /oferta/[id] deep link
Alt PUBLISH: ActionBar Subir → modal → POST /api/offers
Alt FAVORITES LIST: /me/favorites (auth)
```
