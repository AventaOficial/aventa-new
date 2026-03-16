# Notificaciones in-app (campana)

Las notificaciones se muestran en la campana de la barra superior y se almacenan en la tabla `notifications`. El usuario recibe notificaciones en estos casos:

---

## Tipos de notificaciones

| Tipo | Cuándo | Título / mensaje | Enlace |
|------|--------|-------------------|--------|
| **offer_approved** | Un moderador o el CEO aprueba la oferta del usuario | "Moderador [nombre] aprobó tu oferta" o "CEO [nombre] aprobó tu oferta". Cuerpo: "Ya está visible en el feed." (+ mensaje opcional del mod) | `/?o={id}` |
| **offer_rejected** | Un moderador o el CEO rechaza la oferta del usuario | "Moderador [nombre] rechazó tu oferta" o "CEO [nombre] rechazó tu oferta". Cuerpo: motivo del rechazo | `/me` |
| **offer_removed** | Un moderador retira la oferta del feed (expira o por reportes) | "Tu oferta fue retirada del feed" | `/me` |
| **offer_like** | Alguien da like (voto positivo) a una oferta del usuario | "Nuevo like" — "[Nombre] dio like a tu oferta: [título corto]" | `/?o={id}` |
| **report_received** | El usuario envía un reporte (confirmación) | "Reporte recibido" — "Gracias por ayudar a la comunidad. Revisaremos tu reporte." | — |

---

## Dónde se crean

- **offer_approved / offer_rejected:** `app/api/admin/moderate-offer/route.ts` (al aprobar o rechazar desde el panel de moderación). Se distingue CEO vs moderador según el rol del usuario que modera.
- **offer_removed:** `app/api/admin/expire-offer/route.ts` (al marcar oferta como expirada/retirada).
- **offer_like:** `app/api/votes/route.ts` (al registrar un voto positivo en una oferta; se notifica al autor).
- **report_received:** `app/api/reports/route.ts` (confirmación al usuario que envió el reporte).

---

## API y UI

- **GET /api/notifications:** lista notificaciones del usuario y contador de no leídas (requiere auth).
- **PATCH /api/notifications:** marcar una o todas como leídas (body opcional: `{ id: string }`).
- La campana y el listado de notificaciones están en `app/components/Navbar.tsx`. Las preferencias de notificaciones/correo en `app/settings/page.tsx` y `app/api/notifications/preferences`.
