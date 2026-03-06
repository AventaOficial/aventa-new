# Checklist de lanzamiento beta — AVENTA

**Última pasada de estabilización:** Marzo 2025  
**Fuente de verdad:** Documentación en `/docs`.

---

## 1. Bugs críticos (P0) — Estado

| Item | Estado | Notas |
|------|--------|--------|
| **Voto en OfferPageContent** | ✅ Corregido | API recibe 2 (up) o -1 (down); quitar voto envía valor actual para que la API borre la fila. |
| **Voto en OfferCard** | ✅ Verificado | sendVote(2 \| -1) correcto; toggle envía mismo valor y API borra. |
| **Persistencia en BD** | ✅ | offer_votes.value = 2 o -1; triggers actualizan counts. |

---

## 2. Estabilidad y duplicación

| Item | Estado | Notas |
|------|--------|--------|
| **Vista canónica de oferta** | ✅ | Solo `/oferta/[id]`. Home ya no usa OfferModal. |
| **Modal en home** | ✅ Eliminado | Eliminados selectedOffer, efectos por ?o= y render de OfferModal. Middleware redirige /?o=id → /oferta/id. |
| **Comentarios** | ✅ | Lógica solo en OfferPageContent (página oferta). OfferModal sigue existente para otros usos pero no se usa en home. |

---

## 3. Manejo de errores (feedback visible)

| Área | Cambio |
|------|--------|
| **Feed** | Ya existía: feedError + "No pudimos cargar las ofertas" + Reintentar. |
| **app-config** | Toast: "No se pudo cargar la configuración. Usa la app con normalidad." |
| **stores** | Toast: "No se pudieron cargar las tiendas. Revisa tu conexión." |
| **Voto (OfferCard)** | Toast: "No se pudo registrar el voto. Revisa tu conexión." |
| **Voto (OfferPageContent)** | Toast: "No se pudo registrar el voto. Revisa tu conexión." |
| **Settings preferred-categories** | Toast: "No se pudieron cargar tus categorías preferidas." |

Pendiente (no bloqueante para beta): notificaciones en Navbar, algunos catches en admin (métricas, similares) pueden seguir silenciosos o mostrar error en UI local.

---

## 4. Flujo E2E a validar manualmente

1. **Registro** — Google OAuth → redirect a /.
2. **Onboarding** — Categorías (y registro si aplica).
3. **Subir oferta** — ActionBar → Subir oferta → formulario → enviar.
4. **Votar** — En feed (OfferCard) y en `/oferta/[id]` (OfferPageContent); verificar que up/down persisten.
5. **Comentar** — En página oferta; enviar y like.
6. **Favorito** — Corazón en card o en página oferta.
7. **Compartir** — Botón compartir; enlace a /oferta/[id].
8. **Reportar** — En página oferta; modal reporte con tipo y descripción.
9. **Moderador aprueba** — Admin → Moderación → aprobar oferta.
10. **Oferta en feed** — Tras aprobar, debe aparecer en home (según filtros y vista).

Estados rotos a vigilar: oferta no encontrada (404), feed vacío sin mensaje (ya hay empty state), error de carga con Reintentar.

---

## 5. Rendimiento y estabilidad (auditoría breve)

- **Re-renders:** Feed con muchos useState; UIProvider global. Aceptable para beta; optimizar con React Query/SWR en P2.
- **Duplicados de fetch:** fetchBatchUserData al cambiar offers; un fetch por carga. Aceptable.
- **Race conditions:** visibilitychange vuelve a llamar fetchOffers; sin cancelación por request. Riesgo bajo; en P2 se puede usar AbortController.
- **Imágenes:** next/image en OfferCard y OfferPageContent; remotePatterns configurados.
- **Hidratación:** Página oferta es server component que pasa props a client; comentarios y votos se hidratan en cliente. Sin cambios de estructura que rompan hidratación.

---

## 6. SEO listo para beta

| Elemento | Estado |
|----------|--------|
| **Sitemap** | Dinámico: estáticas, categorías, tiendas, ofertas (hasta 10k). |
| **Canonical** | En oferta, categoría, tienda (generateMetadata). |
| **Structured data** | JSON-LD Product, Offer, AggregateRating en `/oferta/[id]`. |
| **OG / Twitter** | title, description, imagen absoluta. |
| **Contenido SSR** | Página oferta: getOffer en servidor, metadata y payload a OfferPageContent. |
| **Indexable** | Rutas públicas sin noindex; admin/me/settings en Disallow. |

---

## 7. Checklist de lanzamiento

### Estabilidad de producto

- [x] Votación correcta en card y página.
- [x] Vista canónica única (/oferta/[id]).
- [x] Errores de carga con mensaje o toast (feed, config, tiendas, votos, categorías settings).
- [ ] **Prueba E2E manual** completa (registro → oferta → votar → comentar → favorito → compartir → reportar → moderar).

### Loops core

- [x] Feed carga (Recomendado, Top, Para ti, Recientes).
- [x] Navegación card → /oferta/[id].
- [x] Votos y favoritos persisten.
- [x] Comentarios en página oferta.

### Interacción comunidad

- [x] Comentarios y respuestas.
- [x] Reportar oferta (modal en página).
- [x] Compartir enlace canónico.

### SEO básico

- [x] Sitemap, canonical, JSON-LD, OG.
- [x] Redirección /?o=id → /oferta/id.

### Moderación admin

- [x] Pendientes / aprobar / rechazar / expirar.
- [x] Reportes y bans.
- [x] Ofertas de testers (toggle owner).

---

## Bloqueantes restantes

1. **Prueba E2E manual** — Ejecutar el flujo completo una vez antes de abrir beta (recomendación GUIA).
2. **Estado "Mis ofertas" en /me** — Verificar que todas las listas de mis ofertas muestren Pendiente/Aprobada/Rechazada/Expirada (OfferCard con dealStatus; revisar que /me pase status y rejectionReason).

---

## Puntuación de preparación para lanzamiento

| Criterio | Peso | Valoración |
|----------|------|------------|
| Bugs críticos resueltos | 25% | 100% (voto corregido) |
| Vista canónica y sin duplicación modal | 15% | 100% |
| Errores visibles (no silenciosos) | 15% | 90% (principales flujos cubiertos) |
| Flujo E2E verificado | 20% | 0% hasta ejecutar prueba manual |
| SEO y indexación | 15% | 100% |
| Moderación y admin | 10% | 100% |

**Recomendación:** **~82%** listo. Ejecutar la prueba E2E y confirmar estado en /me para cerrar el 18% restante antes de abrir la beta.
