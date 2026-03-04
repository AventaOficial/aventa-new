# Alineación docs vs código — AVENTA

**Uso:** Revisión de que la documentación (auditorías, checklist, continuidad) esté alineada con el código actual. Actualizar este doc cuando se añadan features o se cambie estructura.

---

## 1. Documentos de referencia

| Doc | Propósito | Fuente de verdad |
|-----|-----------|------------------|
| [CHECKLIST_LANZAMIENTO.md](./CHECKLIST_LANZAMIENTO.md) | Verificación pre-lanzamiento | Sí — refleja lo que debe estar listo. |
| [AUDITORIA_PRE_BETA_Y_CHECKLIST.md](./AUDITORIA_PRE_BETA_Y_CHECKLIST.md) | Checklist técnica pre-beta | Sí — auth, ofertas, correos, rendimiento, UX. |
| [CONTINUIDAD_CHAT_BETA_LIDERES_Y_AUDITORIA.md](./CONTINUIDAD_CHAT_BETA_LIDERES_Y_AUDITORIA.md) | Cierre de sesión, pendientes, siguiente chat | Sí — línea del tiempo y pendientes. |
| [ESTADO_PROYECTO.md](./ESTADO_PROYECTO.md) | Estado actual del proyecto (stack, repo) | Sí — resumen corto. |
| [ANALISIS_AUDITORIA_Y_ESTADO.md](./ANALISIS_AUDITORIA_Y_ESTADO.md) | Análisis post-auditoría Supabase | Parcial — §3.1 reportes está desactualizado (ver abajo). |
| [README.md](./README.md) | Índice de documentación | Enlaces a supabase-contexto.md y migraciones.md no existen en repo; corregir. |

---

## 2. Código vs docs — páginas y APIs

### 2.1 Páginas (app/**/page.tsx)

| Ruta | En checklist/docs | En código | Nota |
|------|-------------------|-----------|------|
| / | Home, feed, filtros | ✅ | Alineado. |
| /descubre | — | ✅ | Página existe. |
| /me | Mi perfil, mis ofertas | ✅ | Alineado. |
| /me/favorites | Favoritos | ✅ | Alineado. |
| /settings | Configuración | ✅ | Alineado. |
| /u/[username] | Perfil público | ✅ | Alineado. |
| /privacy, /terms | Legal | ✅ | Alineado. |
| /admin/moderation | Pendientes, aprobar/rechazar | ✅ | Alineado. |
| /admin/moderation/approved | Aprobadas | ✅ | Alineado. |
| /admin/moderation/rejected | Rechazadas | ✅ | Alineado. |
| /admin/moderation/comments | Comentarios | ✅ | Alineado. |
| /admin/moderation/bans | Baneos | ✅ | Alineado. |
| /admin/reports | Reportes de usuarios | ✅ | **Implementado.** Listado, filtros, panel oferta, acciones. ANALISIS decía "Próximamente"; ya no. |
| /admin/logs | Logs de moderación | Placeholder | Página existe pero contenido "Próximamente (Fase 3)". Checklist marca ✅ por existencia de ruta. |
| /admin/users | Usuarios | Placeholder | "Próximamente (Fase 4)". |
| /admin/metrics | Métricas | ✅ | Alineado. |
| /admin/health | Health | ✅ | Alineado. |
| /admin/team | Equipo (roles) | ✅ | Alineado. |
| /admin/announcements | Avisos | ✅ | Alineado. |
| /communities | — | Placeholder | "Próximamente". |
| /auth/reset-password | — | ✅ | Página existe. |

### 2.2 APIs (app/api)

Las rutas listadas en CHECKLIST y en CONTINUIDAD coinciden con lo implementado: votes, offers, reports, admin/moderate-offer, admin/comments, admin/reports, admin/bans, cron/daily-digest, cron/weekly-digest, notifications, sync-profile, profile/[username], etc. Si se añaden nuevas APIs (ej. app-config, admin/app-config), documentarlas aquí o en ESTADO_PROYECTO.

---

## 3. Desalineaciones corregidas o a tener en cuenta

### 3.1 ANALISIS_AUDITORIA_Y_ESTADO.md

- **§3.1 Sistema de reportes:** El doc dice que `/admin/reports` muestra "Próximamente (Fase 3)" y que falta el botón Reportar. **En código:** Reportar en OfferModal/OfferCard existe, POST /api/reports existe, y /admin/reports tiene listado completo, filtros por estado y panel de oferta. **Acción:** Marcar en ANALISIS que §3.1 está resuelto o actualizar el párrafo.

### 3.2 docs/README.md

- **Enlaces rotos:** La tabla "Documentos activos" enlaza a `supabase-contexto.md` y `migraciones.md`, que **no existen** en el repo. **Acción:** Quitar esos enlaces o sustituir por " (no creados)" / enlazar solo a docs que existan (moderacion.md, modelo-votos.md, etc.).

### 3.3 Moderación (MODERACION_OBJETIVOS_Y_VISTA, CONTINUIDAD)

- **Objetivos del día:** El doc pide bloque "Objetivos del día/semana" con contadores por categoría y aprobadas hoy. Si en tu rama/worktree está implementado (MODERATION_DAILY_GOAL, stats, bloque con Target), está alineado; si no, sigue en "pendiente" en CONTINUIDAD §6.2.
- **Vista de oferta (descripción, pasos, URL):** Según CONTINUIDAD ya se hizo en ModerationOfferCard (modal Ver oferta con descripción, pasos, condiciones, URL copiar/abrir). Verificar en código.

### 3.4 Placeholders que siguen en código

- **/admin/logs:** Solo texto "Próximamente (Fase 3)". La tabla `moderation_logs` y la API existen; falta conectar la UI.
- **/admin/users:** Solo texto "Próximamente (Fase 4)".
- **/communities:** Página placeholder.

---

## 4. Resumen

- **Checklist y auditoría pre-beta:** Alineados con el producto; usarlos como referencia para "qué está listo".
- **Reportes:** Completamente implementados (API + admin UI); actualizar ANALISIS.
- **README docs:** Corregir enlaces a archivos inexistentes.
- **Logs/Users/Communities:** Placeholders; no contradicen la checklist si se entiende que "panel existe, contenido pendiente".

Cuando añadas una feature nueva (ej. ofertas de testers, app_config, objetivos de moderación en UI), actualiza ESTADO_PROYECTO o CONTINUIDAD y, si aplica, esta alineación.
