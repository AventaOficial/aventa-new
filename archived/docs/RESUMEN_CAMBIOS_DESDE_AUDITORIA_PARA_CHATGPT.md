# Resumen de cambios desde la auditoría — Para contexto ChatGPT

**Objetivo:** Poner en contexto a ChatGPT. Él ya conoce el **modelo de negocio**, el **sistema de economía/reputación** (sin economía monetaria aún; reputación interna por niveles), el enfoque en **uso real** y **escala** a futuro. Este documento resume qué había después de las auditorías (Cursor + Supabase + la suya por mensaje) y **todos los cambios que hicimos desde entonces**.

---

## 1. Línea de tiempo

1. **Auditoría Cursor (esta IDE):** Cambios de diseño, formulario con vista previa, steps/conditions/coupons, reportes, reputación con contadores (submitted/approved/rejected), migraciones 029 y 030.
2. **Auditoría Supabase:** Coherencia BD–código, tablas en uso, elementos sin conectar (reportes, RPCs reputación, trigger offer_events). Documento: `ANALISIS_AUDITORIA_Y_ESTADO.md`.
3. **Auditoría ChatGPT (por mensaje):** Enfocada en modelo, economía, uso real y escala. No está en repo; tú la tienes en el chat.
4. **Desde entonces:** Todo lo listado en §2 y §3 de este documento.

---

## 2. Estado justo después de las auditorías (baseline)

- **Ofertas:** CRUD, votos, favoritos, comentarios; información adicional (steps, conditions, coupons) guardada y mostrada en OfferModal.
- **Eventos:** view, outbound, share; APIs de track.
- **Moderación:** Cola pendientes, aprobar/rechazar ofertas; logs en `moderation_logs`.
- **Reportes:** Botón Reportar en OfferModal, admin/reports, tabla `offer_reports`.
- **Reputación (antigua):** Contadores en profiles (offers_submitted_count, offers_approved_count, offers_rejected_count) y RPCs para incrementar; **sin** niveles ni score interno ni peso de voto.
- **Perfil público:** Enlace a autor; API por “username” pero **sin columna `slug`** en profiles → usuarios de Google podían dar “Usuario no encontrado” al hacer clic en “cazado por”.
- **Feed:** Vista ranked; sin badge “Destacada”, sin explicación clara de niveles, sin filtros por tienda/categoría en la UI del home (o con filtros que luego quitamos).
- **Moderación:** Sin “marcar expirada”, sin ofertas similares, sin acciones en lote, sin filtros por tienda/categoría/fecha/risk/autor, sin historial visible por oferta.
- **Onboarding:** Sin paso inicial solo logo/animación; dos logotipos en bienvenida.
- **Comparativa vs Promodescuentos:** Doc existía; checklist “qué nos falta” sin marcar como hecho.

---

## 3. Cambios realizados desde entonces (lista completa)

### 3.1 Reputación y confianza (sistema nuevo)

- **Sistema de reputación interno (trust score):**  
  Columnas `reputation_score`, `reputation_level`, `is_trusted` en `profiles`.  
  Score: +10 oferta aprobada, −15 rechazada, +2 comentario aprobado, −5 rechazado, +1 like recibido.  
  Niveles 1–4 (Nuevo, Contribuidor, Cazador Pro, Elite).  
  RPC `recalculate_user_reputation`; se llama al aprobar/rechazar oferta, al moderar comentarios y al dar/quitar like.  
  Doc: `REPUTACION_TRUST_SCORE.md`; migraciones en `docs/supabase-migrations/` (reputation_trust_score, reputation_vote_weight).

- **Efectos por nivel:**  
  Nivel 1: todo a moderación. Nivel 2: comentarios auto-aprobados. Nivel 3: ofertas auto-aprobadas (visibles en “Nuevas”). Nivel 4: mismo + peso de voto mayor en backend.

- **Peso de voto por reputación:**  
  El score del feed usa votos ponderados por nivel (Nivel 1: +2/−1; 2: +2.2/−1.1; 3: +2.5/−1.2; 4: +3/−1.5). Solo backend; no se muestra el peso al usuario.

- **Barra de nivel en perfil:**  
  Componente `ReputationBar` en `/me` y `/u/[username]` con “Nivel X – [label]” y barra de progreso.

- **Explicación de niveles:**  
  Botón “¿Qué significan los niveles?” en la barra abre modal con texto por nivel (moderación, auto-aprobación, peso de voto). `LEVEL_EXPLANATIONS` en `ReputationBar.tsx`.

### 3.2 Feed, ranking y señal de calidad

- **Vista y ranking:**  
  Feed ordenado por `ranking_blend` (ranking_momentum + reputation_weighted_score). Vistas: General (Recomendado), Top, Para ti, Recientes. Línea de ayuda bajo los tabs.

- **Badge “Destacada”:**  
  Ofertas con `ranking_blend` ≥ umbral muestran etiqueta “Destacada” en la tarjeta. Solo señal visual; **no da puntos ni recompensas** (evitamos el “farmear para 100” tipo Promodescuentos).

- **Filtros en home:**  
  Se quitaron los selectores “Tienda” y “Categoría” del home para no dar sensación de página vacía con pocas ofertas; el **buscador** cubre búsqueda por texto (y en backend hay filtros por tienda/categoría para cuando se quieran reañadir).

- **Búsqueda:**  
  Búsqueda en título, tienda y descripción; resultados ordenados por `ranking_blend`. Categorías en ofertas y en moderación; filtro por categoría en lógica (no en UI del home actual).

### 3.3 Categorías y descubribilidad

- **Categorías:**  
  Columna `category` en `offers` (migración `offers_category.sql`). Formulario de oferta y API guardan categoría. Vista `ofertas_ranked_general` / ranking actualizado para incluir category. Filtro por categoría en panel de moderación.

### 3.4 Moderación de ofertas

- **Marcar oferta como expirada:**  
  API `POST /api/admin/expire-offer`; tipo de reporte “expirada”; botón en moderación para marcar expirada.

- **Ofertas similares:**  
  API para obtener ofertas similares (por tienda/título); uso en formulario de nueva oferta y en moderación (evitar duplicados).

- **Acciones en lote:**  
  Aprobar, rechazar y marcar expiradas varias ofertas a la vez en `/admin/moderation`.

- **Filtros en moderación:**  
  Por tienda, categoría, rango de fechas, “Risk alto”, autor.

- **Historial de moderación:**  
  Tabla `moderation_logs`; API `GET /api/admin/moderation-logs?offer_id=...`; botón “Historial” en la tarjeta de cada oferta en el panel de moderación.

### 3.5 Formulario de oferta y pasos

- **Pasos configurables (hasta 20):**  
  En el formulario de subir oferta: “Paso 1”, “Paso 2”, … con opción “Agregar paso” hasta un máximo de 20. Se guardan en `offers.steps` (texto estructurado) y se muestran en OfferModal como “Cómo obtener la oferta”.

### 3.6 Métricas de impacto

- **Eventos y panel de métricas:**  
  Eventos `view`, `outbound`, `share` ya existían; se mantienen y usan.  
  Panel **Métricas** en admin: vistas, clics outbound (por oferta), CTR, resumen de impacto. Uso para ranking y, a futuro, **recompensa por impacto** (baja, por calidad).  
  API `track-outbound` al hacer clic en “CAZAR OFERTA”; enlace a oferta y resumen de impacto en el panel.

### 3.7 UI y producto

- **MSI en verde:**  
  Meses MSI en verde (emerald) en OfferCard y OfferModal para mejor lectura.

- **Icono/logo AVENTA:**  
  Componente `AventaIcon` (A estilizada / flecha) usado en loading, Hero y onboarding junto al texto AVENTA.

### 3.8 Perfil público y usuarios de Google

- **Slug en perfiles:**  
  Migración `profiles_slug.sql`: columna `slug` en `profiles`, rellenada desde `display_name` (misma normalización que el front: minúsculas, espacios→guion, solo a-z0-9-). Función `get_profile_by_slug(slug)` para la API.

- **Sync de perfil:**  
  En `POST /api/sync-profile` se actualiza/crea `slug` al crear o actualizar perfil (login con Google u otro). Así, al hacer clic en “cazado por” se resuelve correctamente el perfil público (`/u/[slug]`) y deja de salir “Usuario no encontrado” para usuarios de Google.

### 3.9 Onboarding

- **Paso 0 (solo marca):**  
  Nueva pantalla inicial: icono arriba, texto “AVENTA” abajo con animación en ola (letra a letra). Duración 3 segundos y paso automático al siguiente paso. Sin botón; solo animación de marca.

- **Paso 1 (bienvenida):**  
  Un solo logotipo: icono centrado arriba y texto “AVENTA” debajo (se quitó el logo pequeño que había arriba). Mensaje de bienvenida y botón “Continuar”.

- **Indicador de pasos:**  
  Cuatro puntos (Logo → Bienvenida → Cómo funciona → Auth).

### 3.10 Documentación y comparativa

- **Comparativa AVENTA vs Promodescuentos:**  
  Se añadió la sección **11. Estado actual del checklist** en `COMPARATIVA_AVENTA_VS_PROMODESCUENTOS.md`: tabla de “Hecho” (§9) y estado de los 6 puntos de “Falta” (badge Destacada, descubribilidad, explicación niveles, experiencia moderación, métricas, no copiar). Conclusión: lo pedido para estar a la altura o superarlos está implementado o parcial; lo que falta para **superar** es escala, uso real y economía por impacto (fase posterior, §10 del mismo doc).

- **Roadmap y checklist:**  
  `ROADMAP_PRODUCTO.md` y `CHECKLIST_LANZAMIENTO.md` actualizados con el estado actual (filtros, categorías, moderación, métricas, perfil público, etc.).

---

## 4. Resumen para ChatGPT (una página)

- **Modelo y economía:** Siguen como en tu auditoría: reputación interna (score + niveles 1–4), **sin economía monetaria aún**. Niveles desbloquean confianza (menos moderación, más peso de voto), no recompensas tangibles. La economía futura será **por impacto** (baja, acotada), después de tener estable el sistema de confianza. Ver §10 de `COMPARATIVA_AVENTA_VS_PROMODESCUENTOS.md`.

- **Uso real y escala:**  
  - Métricas de impacto implementadas (vistas, outbound, CTR; panel en admin).  
  - Ranking con `ranking_blend` (votos ponderados por reputación + momentum + tiempo).  
  - Señal “Destacada” sin dar puntos.  
  - Moderación con filtros, lote e historial.  
  - Perfil público funcionando para todos (incl. Google) vía `slug`.  
  Lo que falta para “escala” es **tráfico y uso real**; el producto está listo para que la reputación y las métricas cobren sentido con volumen.

- **Cambios técnicos clave desde tu auditoría:**  
  Reputación con niveles y peso de voto; badge Destacada; categorías en ofertas y moderación; búsqueda mejorada; moderación (expirar, similares, lote, filtros, historial); pasos 1–20 en ofertas; métricas de impacto en admin; slug en perfiles y sync para Google; onboarding en 4 pasos con paso 0 animado; doc comparativa con checklist actualizado.

---

## 5. Archivos y docs de referencia

| Tema | Documento / ubicación |
|------|------------------------|
| Reputación y niveles | `REPUTACION_TRUST_SCORE.md`, `lib/reputation.ts`, `lib/server/reputation.ts` |
| Comparativa vs PD y checklist | `COMPARATIVA_AVENTA_VS_PROMODESCUENTOS.md` (§9, §10, §11) |
| Roadmap producto | `ROADMAP_PRODUCTO.md` |
| Lanzamiento | `CHECKLIST_LANZAMIENTO.md` |
| Migraciones | `docs/supabase-migrations/` (reputation_*, view_ranking_blend, offers_category, profiles_slug, etc.) |
| Estado post-auditorías | `ANALISIS_AUDITORIA_Y_ESTADO.md`, `AUDITORIA_SESION_ACTUAL.md` |
| Resumen anterior (pre-reputación completa) | `RESUMEN_CAMBIOS_PARA_CHATGPT.md` |

---

*Documento generado para dar contexto a ChatGPT: modelo, economía, uso real y escala conocidos por él; cambios aplicados desde la auditoría Cursor + Supabase + su auditoría por mensaje.*
