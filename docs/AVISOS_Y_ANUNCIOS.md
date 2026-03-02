# Avisos (anuncios del sitio) — AVENTA

Solo el **owner** gestiona avisos (panel Admin → Avisos). La pestaña Avisos de la campana muestra "Descubre AVENTA" y la lista de avisos activos.

---

## 1. Qué son los avisos

- Mensajes cortos que el equipo muestra a todos los usuarios (ej. “Activa los correos en Configuración”, “Nueva tienda asociada”, mantenimiento programado).
- Se ven en la campana del navbar, pestaña **Avisos** (hoy muestra “No tienes avisos”).
- Solo el **owner** puede crear y editar avisos (admin y moderadores no ven la sección Avisos en el panel).

---

## 2. Base de datos (propuesta)

- **Tabla `announcements` (o `avisos`):**
  - `id` (uuid), `title`, `body` (texto o HTML simple), `link` (opcional, ej. `/settings`), `created_at`, `created_by` (user_id), `active` (boolean, para ocultar sin borrar).
- RLS: lectura pública (solo filas `active = true`), escritura solo con rol admin/owner (o con reputación mínima de admin, si se implementa).

---

## 3. API

- **GET /api/announcements** — Lista de avisos activos (para la campana y para una futura página “Avisos” si se quiere).
- **POST /api/admin/announcements** — Crear aviso (admin/owner).
- **PATCH/DELETE** — Editar o desactivar (admin/owner).

---

## 4. Panel de moderación (admin)

- En **Admin → Moderación** (o nueva sección “Avisos”): lista de avisos, botón “Nuevo aviso”, editar/desactivar.
- Permiso: solo **owner** (admin y moderadores no ven la sección Avisos).

---

## 5. Campana (Navbar)

- Pestaña **Avisos:** en lugar del mensaje genérico, hacer fetch a `GET /api/announcements` y mostrar la lista (título, resumen, enlace).
- Mismo estilo que la pestaña Ofertas (lista con enlaces).

---

## 6. Reputación de admins (opcional)

- Si se quiere que “desbloquear” la creación de avisos dependa de la reputación del admin: definir umbral (ej. solo admins con X puntos pueden crear avisos) y comprobar en el endpoint POST.

---

## 7. Orden de implementación

1. Migración: tabla `announcements` y RLS.
2. API: GET pública y POST/PATCH/DELETE protegidos (admin/owner).
3. Panel admin: página o sección para listar y CRUD de avisos.
4. Navbar: conectar pestaña Avisos a `GET /api/announcements` y mostrar lista.

---

## 8. Nota sobre “el resumen ya marcado” / “nuevo usuario ve Avisos como nuevo”

- Si “Avisos” y “Ofertas” comparten el mismo dropdown, asegurar que el estado “leído” sea por usuario (notificaciones ya lo son). Los avisos pueden ser solo lectura global: no hace falta “marcar como leído” por usuario a menos que se quiera guardar qué avisos ha visto cada uno (tabla `user_announcement_reads`).
