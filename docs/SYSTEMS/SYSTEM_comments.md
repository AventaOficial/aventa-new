# SYSTEM — Comentarios

## Architecture

- **Frontend:** OfferPageContent (página oferta) muestra lista de comentarios y formulario para añadir. Like en comentarios vía POST /api/offers/[offerId]/comments/[commentId]/like. Reporte vía /api/offers/[offerId]/comments/[commentId]/report.
- **Backend:** GET/POST app/api/offers/[offerId]/comments/route.ts. Admin: app/api/admin/comments para moderar.

## Data flow

1. Carga de oferta → se cargan comentarios (GET comments por offer_id, orden por created_at).
2. Usuario escribe y envía → POST con body { content }; API valida auth, insert en offer_comments.
3. Like en comentario → POST like → insert/delete en comment_likes; contador en comentario.
4. Reportar comentario → POST report con tipo y descripción → insert en reports (target_type = comment).

## Database usage

- **offer_comments:** offer_id, user_id, content, created_at. Relación con profiles para autor.
- **comment_likes:** (user_id, comment_id). Triggers o aplicación actualizan like count.
- **reports:** target_type, target_id, reporter_id, reason, description.

## Edge cases

- **Sin sesión:** No puede comentar; UI muestra CTA login/registro.
- **Comentario vacío o muy largo:** Validación en API; 400 con mensaje.
- **Moderación:** Admin puede ocultar/eliminar; comentarios ocultos no se muestran en lista.
