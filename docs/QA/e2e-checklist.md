# Checklist E2E — AVENTA

Checklist de pruebas end-to-end para validar el flujo completo del producto. Ejecutar manualmente antes de cada release relevante (beta, GA).

---

## 1. Flujo E2E principal

### Autenticación

- [ ] **Registro** — OAuth (Google) → redirect a home; perfil creado.
- [ ] **Login** — Usuario existente inicia sesión; redirección correcta.
- [ ] **Onboarding** — Tras registro, flujo de categorías preferidas (si aplica).

### Oferta

- [ ] **Subir oferta** — ActionBar → Subir oferta → rellenar formulario (título, precios, categoría, tienda) → enviar → mensaje de éxito; cooldown 60 s.
- [ ] **Subir con URL** — Pegar URL de Amazon/ML → parse-offer-url rellena campos → enviar oferta.
- [ ] **Subir con imagen** — Subir imagen en formulario → guardar oferta con image_url.

### Interacción

- [ ] **Votar** — En feed (OfferCard): like/dislike; en `/oferta/[id]` (OfferPageContent): like/dislike. Verificar que el voto persiste al recargar.
- [ ] **Quitar voto** — Clic de nuevo en el mismo botón → voto eliminado; contador actualizado.
- [ ] **Comentar** — En página oferta: escribir comentario → enviar → aparece en lista.
- [ ] **Like en comentario** — Like en un comentario; contador actualizado.
- [ ] **Favorito** — Corazón en card o en página oferta; favorito persiste y aparece en /me (si existe vista).

### Compartir y reportar

- [ ] **Compartir** — Botón compartir → elegir canal (Telegram, WhatsApp, X, Copiar) → enlace correcto a `/oferta/[id]`; evento share registrado (opcional).
- [ ] **Reportar oferta** — En página oferta: Reportar → tipo y descripción → enviar; confirmación.
- [ ] **Reportar comentario** — Reportar comentario (si existe); confirmación.

### Moderación y visibilidad

- [ ] **Moderación — aprobar** — Admin → Moderación → oferta pendiente → Aprobar; oferta pasa a approved.
- [ ] **Oferta en feed** — Tras aprobar, la oferta aparece en home (Recomendado/Top/Recientes según filtros).
- [ ] **Moderación — rechazar** — Rechazar oferta; no aparece en feed; estado visible para el creador en /me (Pendiente/Aprobada/Rechazada/Expirada).

### Comunidades

- [ ] **Página /communities** — Carga hero, card "Equipo Aventa", estadísticas (cazadores, ofertas), miembros del equipo (avatar, nombre, rol), ofertas de la comunidad (OfferCard); votar/favorito si hay sesión.
- [ ] **Admin Comunidades (solo owner)** — Usuario con rol owner ve enlace "Comunidades" en sidebar (sección Solo owner); al entrar, ve enlace a /communities. Usuario sin rol owner no ve el enlace y es redirigido si accede a /admin/communities directamente.

---

## 2. Casos límite y errores

- [ ] **Sin sesión — votar** — Toast o mensaje pidiendo crear cuenta; no 500.
- [ ] **Sin sesión — comentar** — No permite enviar; CTA login.
- [ ] **Feed vacío** — Empty state en español; botón Reintentar si hubo error.
- [ ] **Error de carga feed** — Mensaje "No pudimos cargar las ofertas" + Reintentar.
- [ ] **Oferta no encontrada** — 404 en `/oferta/[id]` inexistente.
- [ ] **Usuario baneado** — Al subir oferta: 403 y mensaje claro.

---

## 3. Regresión (guidelines)

- **Antes de cada release:** Ejecutar al menos la sección 1 (flujo E2E principal).
- **Tras cambios en votación:** Verificar votar / quitar voto en card y en página oferta; comprobar que los contadores coinciden con BD (offer_votes, triggers).
- **Tras cambios en feed:** Verificar carga de Recomendado, Top, Para ti, Recientes; filtros por categoría y tienda; búsqueda.
- **Tras cambios en subir oferta:** Verificar formulario, parse-offer-url, upload imagen, rate limit y cooldown.
- **Tras cambios en admin:** Verificar login admin, cola de moderación, aprobar/rechazar, reportes.
- **Tras cambios en comunidades:** Verificar /communities carga datos y ofertas; owner ve enlace Comunidades en admin.

---

## 4. Referencias

- Flujo detallado de subir oferta: `docs/SISTEMA_SUBIR_OFERTA.md`
- Checklist de lanzamiento: `docs/LAUNCH_CHECKLIST_BETA.md`
- PRDs: `docs/PRD/`
