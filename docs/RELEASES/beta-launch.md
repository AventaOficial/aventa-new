# Beta launch — AVENTA

Documento de preparación para el lanzamiento beta. No modifica código; solo documenta estado y checklist.

---

## 1. Features listos para beta

| Feature | Estado | Notas |
|--------|--------|--------|
| **Subir oferta** | ✅ | ActionBar modal, parse-offer-url, upload imagen, cooldown 60 s. |
| **Votación** | ✅ | 2 / -1 en API; OfferCard y OfferPageContent; triggers BD. |
| **Comentarios** | ✅ | Página oferta; like en comentarios; reporte comentario. |
| **Compartir** | ✅ | Telegram, WhatsApp, X, Copiar; eventos share. |
| **Feed y ranking** | ✅ | Vitales, Top, Para ti, Recientes; ofertas_ranked_general. |
| **Perfiles** | ✅ | public_profiles_view; /api/profile/[username]; Settings. |
| **Moderación** | ✅ | Admin: pendientes, aprobar, rechazar; reportes; logs. |
| **Extensión navegador** | ✅ | /subir con params; prefill en ActionBar. |
| **Comunidades** | ✅ | Página /communities (Equipo Aventa); admin "Comunidades" solo owner. |

---

## 2. Sistemas listos

- **Upload offer:** Flujo documentado en PRD y SYSTEM_upload_offer. API offers, upload-offer-image, parse-offer-url.
- **Voting:** SYSTEM_voting. API votes; offer_votes; triggers.
- **Feed ranking:** SYSTEM_feed_ranking. Vista ofertas_ranked_general; filtros y búsqueda.
- **Comments:** SYSTEM_comments. API comments por oferta; like y report.
- **Moderation:** SYSTEM_moderation. moderate-offer; reports; moderation-logs.
- **Profiles:** SYSTEM_profiles. public_profiles_view; me; sync-profile.
- **Share:** SYSTEM_share. shareText; eventos.
- **Communities:** SYSTEM_communities. /communities; miembros por leader_badge cazador_aventa; ofertas de la comunidad; admin Comunidades solo owner.

---

## 3. Riesgos conocidos

| Riesgo | Mitigación |
|--------|------------|
| **Vista ofertas_ranked sin category** | Aplicar migración fix_ofertas_ranked_general_category.sql si el feed devuelve 400 al filtrar por categoría. |
| **Prueba E2E no ejecutada** | Ejecutar docs/QA/e2e-checklist.md antes de abrir beta. |
| **Estado "Mis ofertas" en /me** | Verificar que Pendiente/Aprobada/Rechazada/Expirada se muestren correctamente en OfferCard (dealStatus). |
| **Race en fetch del feed** | visibilitychange vuelve a llamar fetchOffers sin cancelación; riesgo bajo; AbortController en P2. |
| **Errores silenciosos en admin** | Algunos catches (métricas, similares) pueden no mostrar toast; no bloqueante para beta. |

---

## 4. Launch checklist

- [ ] **Prueba E2E manual** — Flujo completo: registro → login → subir oferta → votar → comentar → favorito → compartir → reportar → moderar → oferta en feed (ver docs/QA/e2e-checklist.md).
- [ ] **Estado Mis ofertas** — Confirmar que /me muestra correctamente Pendiente/Aprobada/Rechazada/Expirada.
- [ ] **Vista ranking** — Confirmar que filtros por categoría en feed no devuelven 400 (vista con category).
- [ ] **SEO** — Sitemap, canonical, JSON-LD, OG (ya listos según LAUNCH_CHECKLIST_BETA).
- [ ] **Errores visibles** — Feed, app-config, tiendas, votos, categorías settings con toast o mensaje (ya cubierto).
- [ ] **Moderación** — Admin puede aprobar/rechazar; reportes y bans operativos.

---

## 5. Documentación de producto

- **PRDs:** docs/PRD/ (upload-offer, share-system, voting-system, browser-extension).
- **Sistemas:** docs/SYSTEMS/ (SYSTEM_upload_offer, voting, feed_ranking, comments, moderation, profiles, share, communities).
- **QA:** docs/QA/e2e-checklist.md.
- **Lanzamiento:** docs/LAUNCH_CHECKLIST_BETA.md (detalle técnico y puntuación).
