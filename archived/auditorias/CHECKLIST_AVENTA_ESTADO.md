# Checklist AVENTA v1 — Estado actual (alineado con ChatGPT)

**Última actualización:** Feb 2025  
**Contexto:** Trabajo con Cursor; checklist original de ChatGPT para lanzamiento mínimo.

---

## 1️⃣ INFRAESTRUCTURA

| Ítem | Estado | Notas |
|------|--------|-------|
| Supabase estable | ✅ | En uso |
| RLS correcto | ✅ | offers, comments, votes, favorites |
| UNIQUE (offer_id, user_id) en votos | ✅ | offer_votes |
| Triggers funcionando | ✅ | recalculate_offer_metrics en offer_votes |
| Índices optimizados | ✅ | idx_offers_ranking_momentum_desc, etc. |
| View ofertas_ranked_general | ✅ | Usada en home |
| Realtime en offers | ✅ | useOffersRealtime |
| Vercel producción | ⚠️ | Verificar deploy |
| Variables env seguras | ✅ | Service role solo en servidor |
| **Columna `value` en offer_votes** | ⚠️ | Error "column vote does not exist" — migración 019 creada. Ejecutar en Supabase. |

---

## 2️⃣ CORE PRODUCTO

| Ítem | Estado | Notas |
|------|--------|-------|
| Feed ordenado por ranking_momentum | ✅ | General / Top / Recientes / Para ti |
| Filtro Nuevas / Destacadas / Recientes | ✅ | General, Top, Recientes, Para ti |
| Filtro tiempo (Hoy / Semana / Mes) | ✅ | En modo Top |
| Buscador funcional (title + store) | ✅ | Hero con input |
| OfferCard: precio actual, anterior, % descuento | ✅ | |
| OfferCard: título, tienda, tiempo, votos, comentarios | ✅ | Comentarios count en modal |
| Página/Modal de oferta | ✅ | OfferModal |
| Botón "Ir a oferta" | ✅ | "Ir directo" |
| Comentarios | ✅ | Crear, eliminar propio |
| Votar | ✅ | Upvote / Downvote (API con error de columna) |

---

## 3️⃣ SISTEMA SOCIAL

| Ítem | Estado | Notas |
|------|--------|-------|
| Upvote / Downvote | ✅ | |
| Sin doble voto | ✅ | UNIQUE + lógica |
| Update en tiempo real | ✅ | Realtime + refetch |
| Crear comentario | ✅ | |
| Eliminar propio comentario | ✅ | |
| Tiempo relativo | ✅ | formatRelativeTime |
| **Voto tipo comunidad de ofertas (up +2, down -1)** | ✅ | Migración 021 aplicada. Score = up×2 − down. |

---

## 4️⃣ MODERACIÓN

| Ítem | Estado | Notas |
|------|--------|-------|
| Campo status (pending/approved/rejected) | ✅ | Filtro .or('status.eq.approved,status.eq.published') |
| Panel admin: ver pendientes | ⚠️ | Revisar /admin |
| Panel admin: aprobar / rechazar | ⚠️ | Revisar |
| Rate limit subir oferta | ⚠️ | Cooldown 60s en UI; verificar backend |
| Rate limit comentar | ⚠️ | Verificar |

---

## 5️⃣ PERFIL Y CONFIGURACIÓN

| Ítem | Estado | Notas |
|------|--------|-------|
| Perfil público: username | ✅ | /u/[username] |
| Perfil público: ofertas subidas | ✅ | |
| Perfil público: total votos recibidos | ✅ | |
| Mis ofertas | ✅ | /me |
| Mis favoritos | ✅ | /me/favorites |
| Mis comentarios | ⚠️ | Verificar si existe |
| Cambiar username | ✅ | Settings |
| Cambiar avatar | ✅ | Settings |
| Modo oscuro | ✅ | |
| Cerrar sesión | ✅ | |

---

## 6️⃣ MÉTRICAS Y RANKING

| Ítem | Estado | Notas |
|------|--------|-------|
| votes_count | ✅ | |
| upvotes_count / downvotes_count | ✅ | |
| outbound_24h, ctr_24h | ✅ | En recalculate |
| ranking_momentum | ✅ | |
| UI: Score, Tendencia | ✅ | No se expone fórmula |

---

## 7️⃣ SEGURIDAD

| Ítem | Estado | Notas |
|------|--------|-------|
| UNIQUE votos | ✅ | |
| RLS offers, comments, votes | ✅ | |
| No update manual de métricas | ✅ | Solo trigger |
| Service role solo en API | ✅ | createServerClient |
| Sanitización inputs | ⚠️ | Revisar comentarios |
| No HTML en comentarios | ⚠️ | Revisar |

---

## 8️⃣ PERFORMANCE

| Ítem | Estado | Notas |
|------|--------|-------|
| Sin console.logs innecesarios | ⚠️ | Algunos en votes API |
| Sin re-render loops | ✅ | |
| Imágenes lazy | ⚠️ | Revisar loading |
| Skeleton consistente | ✅ | OfferCardSkeleton |
| Cards visibles en mobile | ✅ | 1.5–2 |

---

## 9️⃣ GROWTH MÍNIMO

| Ítem | Estado | Notas |
|------|--------|-------|
| Botón compartir oferta | ⚠️ | Verificar |
| URL limpia | ✅ | |
| Meta tags OG | ⚠️ | Revisar layout.tsx |
| Título SEO | ⚠️ | Revisar |
| Sitemap básico | ❌ | Pendiente |

---

## 🔟 LO QUE NO VA EN V1 (OK)

- Recompensas por subir
- Sistema de dinero
- Dashboard analítico complejo
- Comunidades avanzadas (solo placeholder)
- Leaderboards
- Afiliación visible
- Gamificación
- Notificaciones push
- Reputación compleja

---

## ACCIONES URGENTES

1. **Votos:** Ejecutar en Supabase (en orden): `019`, `020`, `021`. La 020 añade alias `vote` y CHECK; la 021 aplica score tipo comunidad de ofertas (up +2, down -1).
2. **Voto tipo comunidad de ofertas:** Implementado (up +2, down -1). Ver documentación de votos.
3. **AnimatePresence:** Corregido en Navbar (solo avatar dentro de AnimatePresence; dropdown fuera).
4. **WebSocket:** Revisar si Realtime de Supabase está bien configurado (error "WebSocket closed before connection").

---

## RESUMEN

- **Listo para lanzar:** Casi. Falta corregir votos (columna + regla de 2) y revisar moderación/admin.
- **Diseño PC:** Mejorado (hero más grande, cards más grandes, sidebar más amplio).
- **Alineación con ChatGPT:** Este documento refleja el checklist original y el estado actual del proyecto.
