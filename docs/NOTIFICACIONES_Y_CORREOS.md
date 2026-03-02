# Notificaciones in-app y correos — AVENTA

Plan sencillo: conectar la campana a datos reales y enviar **2 correos** (diario + semanal) a una hora tipo “salida del trabajo”. Opcional: sección “En su pico” en el correo diario.

---

## 1. In-app: campana de notificaciones

- **Ya existe:** botón campana en navbar con dropdown (tabs Ofertas, Comunidades, Avisos).
- **Conectar a:** tabla `notifications` y API `GET /api/notifications` (lista + contador de no leídas), `PATCH` para marcar como leída(s).
- **Tipos de notificación** (para rellenar la campana ahora o más adelante):
  - `offer_approved` — Tu oferta fue aprobada
  - `comment_on_offer` — Comentario en tu oferta
  - `offer_highlighted` — Tu oferta es destacada
  - `daily_digest_sent` — Te enviamos el Top 10 del día (opcional, para que sepan que salió el correo)
- Las pestañas Comunidades y Avisos pueden seguir con mensaje genérico hasta que definamos contenido; en **Ofertas** se muestra la lista real.

---

## 2. Correos que enviamos

### 2.1 Correo 1 — Diario (todos los días de la semana)

- **Contenido:** Top 10 mejores ofertas del día (por `ranking_blend` o score del día).
- **Hora de envío:** Una sola hora fija, tipo “salida del trabajo” (ej. **18:00 hora México**). Configurable por variable de entorno.
- **A quién:** Usuarios que tengan activado “Recibir resumen diario” en preferencias (tabla `user_email_preferences`).
- **Opcional — “En su pico ahora”:** Segunda sección en el mismo correo con 2–3 ofertas que estén “en explosión” (muchos votos o comentarios en las últimas horas). Así no mandamos un correo aparte por cada pico; el usuario ve lo más caliente dentro del resumen diario.

### 2.2 Correo 2 — Semanal (domingos)

- **Contenido:** Resumen de la semana:
  - **3 ofertas más comentadas** de la semana
  - **Mejores votadas** de la semana (ej. top 5 por score)
  - (Opcional tercera sección: más compartidas o destacadas de la semana)
- **Hora de envío:** Misma que el diario (ej. domingo 18:00 México).
- **A quién:** Usuarios con “Recibir resumen semanal” activado.

### 2.3 No hacemos (por ahora)

- Push (no es app).
- Un correo por cada “oferta hot” o por cada oferta en pico (evitamos saturar).

---

## 3. Cómo lo hacemos técnicamente

### 3.1 Base de datos

- **`notifications`:** id, user_id, type, title, body, link (opcional), read_at, created_at. RLS: cada usuario solo ve las suyas.
- **`user_email_preferences`:** user_id (PK), email_daily_digest (boolean), email_weekly_digest (boolean), updated_at. Por defecto false; el usuario activa en Configuración (pantalla posterior).

### 3.2 API

- **GET /api/notifications:** Lista de notificaciones del usuario (últimas N), contador de no leídas. Requiere auth.
- **PATCH /api/notifications:** Marcar una o todas como leídas. Requiere auth.
- **GET /api/cron/daily-digest:** Llamado por Vercel Cron cada día. Calcula top 10 del día (+ opcional “en pico”), lista usuarios con email_daily_digest, envía correo (Resend). Autenticación: si en Vercel tienes `CRON_SECRET`, Vercel envía `Authorization: Bearer CRON_SECRET`; también se acepta `?secret=XXX` o cabecera `x-cron-secret` (p. ej. para cron externo).
- **GET /api/cron/weekly-digest:** Llamado solo domingos a la misma hora. Mismo criterio de secret.

### 3.3 Hora de envío (México)

- **Diario:** `0 0 * * *` = 00:00 UTC = **18:00 México** (mismo día, zona Centro).
- **Semanal:** `0 0 * * 1` = lunes 00:00 UTC = **domingo 18:00 México**.
- No hace falta cron externo: con `CRON_SECRET` en Vercel, los crons de `vercel.json` se ejecutan y Vercel envía el Bearer automáticamente.

### 3.4 Envío de correos

- Servicio: **Resend**. Variables `RESEND_API_KEY` y `EMAIL_FROM` en Vercel.
- **Cómo configurar Resend (cuenta, API key, dominio aventaofertas.com):** ver **[CONFIGURAR_RESEND_Y_CORREOS.md](./CONFIGURAR_RESEND_Y_CORREOS.md)**.
- Plantillas: ver `lib/email/templates.ts` — layout común (cabecera AVENTA, contenido, CTA, pie con enlace a preferencias). Diario: tabla Top 10 con título, tienda, precio (y tachado si hay original). Semanal: dos listas (más comentadas, mejor votadas).

---

## 4. Orden de implementación

1. Migración: `notifications` + `user_email_preferences`.
2. API notificaciones: GET (lista + unread count), PATCH (mark read).
3. Conectar campana en Navbar: fetch a `/api/notifications`, mostrar lista en pestaña Ofertas (o en una sola lista), badge con número de no leídas.
4. Crear notificaciones desde lógica existente: al aprobar oferta → insert en `notifications` para el creador; (opcional) al comentar → notificación al autor de la oferta.
5. Rutas cron: daily-digest y weekly-digest que calculen top 10 / semanal y, si existe `RESEND_API_KEY`, envíen el correo; si no, solo log. Añadir preferencias en Configuración (página /settings) para activar/desactivar diario y semanal.
6. Opcional: sección “En su pico ahora” en el cuerpo del correo diario.

---

## 5. Resumen

- **Campana:** Conectada a tabla y API; el usuario ve notificaciones reales (oferta aprobada, comentario, etc.).
- **Correos:** 2 tipos — (1) diario: Top 10 del día + opcional “en su pico”; (2) semanal (domingo): 3 más comentadas, mejores votadas. Hora tipo 18:00 México.
- **Sencillo:** Sin push, sin un correo por cada hot; todo concentrado en resúmenes y en la campana.
