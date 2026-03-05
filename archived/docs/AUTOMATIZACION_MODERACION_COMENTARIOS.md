# Automatización de moderación de comentarios

## Objetivo

Después de **varios comentarios positivos (con likes)**, poder aprobar automáticamente comentarios que estén en `pending`, para reducir carga de moderación manual.

## Opciones de implementación

### 1. Umbral de likes (recomendado)

- Cuando un comentario en estado `pending` alcanza **N likes** (ej. 3 o 5), actualizar su `status` a `approved`.
- Dónde ejecutarlo:
  - **Al dar like:** en `POST /api/offers/[offerId]/comments/[commentId]/like`, después de insertar el like, contar likes del comentario; si `count >= N` y el comentario está `pending`, hacer `PATCH` interno o `update` en Supabase a `approved`.
  - **Cron / Edge:** job periódico que busque comentarios `pending` con `like_count >= N` y los apruebe (requiere vista o columna `like_count` o consulta a `comment_likes`).

### 2. Implementación en el endpoint de like

En `app/api/offers/[offerId]/comments/[commentId]/like/route.ts`, después de insertar un like:

1. Leer el comentario (status) y el conteo actual de likes.
2. Si `status === 'pending'` y `like_count >= UMBRAL` (ej. 3), actualizar el comentario a `status = 'approved'`.

Esto no requiere cron ni columna denormalizada; el conteo se hace con una query a `comment_likes` por `comment_id`.

### 3. Variable de entorno

Definir por ejemplo `AUTOMOD_COMMENT_LIKES_THRESHOLD=3`. Si no está definida, no se aplica auto-aprobación.

---

## Fotos en comentarios con moderación estricta

- Comentarios con `image_url` no null pueden tratarse como "requieren revisión": al crear, guardar con `status = 'pending'` aunque tengas auto-aprobación por texto.
- En el panel de moderación de comentarios, filtrar o marcar los que tienen imagen para revisión manual.
- La migración ya añade la columna `image_url` en `comments`; el flujo de subida de imagen (upload a storage + URL en el comentario) y la lógica de "si tiene imagen → pending" se pueden añadir en un siguiente paso.

---

## Resumen

| Funcionalidad | Estado |
|--------------|--------|
| Respuestas a comentarios | ✅ Implementado (parent_id, UI en OfferModal) |
| Likes en comentarios | ✅ Implementado (comment_likes, API like, UI) |
| Fotos en comentarios | ✅ Schema (image_url); falta upload y regla "imagen → pending" |
| Baneos | ✅ Implementado (user_bans, API, panel Baneos, check en comentarios y ofertas) |
| Auto-aprobación por N likes | 📋 Pendiente; implementar en like/route.ts según umbral (ej. env) |
