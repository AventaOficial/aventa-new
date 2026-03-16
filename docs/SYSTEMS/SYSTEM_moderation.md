# SYSTEM — Moderación

## Architecture

- **Admin:** app/admin/moderation/page.tsx lista ofertas pendientes y reportes. Acciones: aprobar, rechazar, editar (moderate-offer). Logs en app/api/admin/moderation-logs.
- **Backend:** POST app/api/admin/moderate-offer/route.ts actualiza status (approved, rejected), opcionalmente expires_at, moderator_comment. Reports: app/api/admin/reports, app/api/reports (crear reporte usuario).

## Data flow

1. Oferta nueva → status = pending (o approved si reputación ≥ 3). Aparece en cola de moderación.
2. Moderador abre Admin → Moderación → ve ofertas pendientes y reportes.
3. Aprobar → POST moderate-offer { offerId, action: 'approve', ... } → update offers.status = approved, expires_at.
4. Rechazar → action: 'reject' → status = rejected; opcionalmente notificación al creador.
5. Reportes de usuarios → cola de reportes; moderador puede actuar sobre oferta o comentario.

## Database usage

- **offers:** status (pending, approved, rejected, published), moderator_comment, expires_at.
- **reports:** target_type (offer | comment), target_id, reason, description, status (pending, resolved).
- **moderation_logs:** auditoría de acciones (quién, qué oferta, acción, fecha).

## Edge cases

- **Solo admin:** Rutas /api/admin/* verifican rol; 403 si no es admin.
- **Comunidades:** El enlace "Comunidades" en el sidebar del panel admin y la ruta /admin/communities son solo para owner (canManageTeam). El resto de roles son redirigidos; la página pública /communities es visible para todos.
- **Oferta ya aprobada:** Idempotente; no falla si se re-aprueba.
- **Expiración:** approved con expires_at; el feed filtra expires_at.is.null,expires_at.gte.now().
