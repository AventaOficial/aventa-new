# Prompt para el siguiente chat — Solucionar auth, sync y errores 500/406

Copia y pega este bloque en un **nuevo chat** con el asistente para seguir desde aquí.

---

## Contexto del proyecto

- **Proyecto:** AVENTA (aventaofertas.com) — Next.js 16, React 19, Supabase (Auth + DB), Vercel.
- **Auth:** Solo Google OAuth. Al registrarse, un trigger en Supabase crea la fila en `public.profiles` (función `public.handle_new_user()` en `auth.users`).

---

## Errores actuales (producción: aventaofertas.com)

### 1. No se puede crear cuenta con Google (crítico)

- **Qué pasa:** Tras elegir cuenta de Google, Supabase redirige a  
  `https://aventaofertas.com/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user`
- **Origen:** Supabase Auth devuelve **"Database error saving new user"** en el callback de OAuth. Eso suele indicar fallo al guardar en `auth.users` o al ejecutar un **trigger AFTER INSERT** en `auth.users` (en nuestro caso, el que inserta en `public.profiles`).
- **Qué se hizo:** Se eliminaron usuarios en Supabase (auth.users y public.profiles) excepto uno, para poder probar de nuevo. Aun así, al intentar crear cuenta con Google sigue el mismo error.
- **Objetivo:** Que el registro con Google vuelva a funcionar. Revisar:
  - Que exista el trigger `on_auth_user_created` en `auth.users` llamando a `public.handle_new_user()`.
  - Que la función `handle_new_user()` haga INSERT solo en columnas que existen en `public.profiles` y que no falle por restricciones (NOT NULL, CHECK, tipos).
  - Según el esquema actual, `profiles` tiene: id, username, avatar_url, created_at, display_name, onboarding_completed, offers_submitted_count, offers_approved_count, offers_rejected_count, display_name_updated_at. **No hay columna `updated_at`** en profiles.

### 2. POST /api/sync-profile → 500 (Internal Server Error)

- **Qué hace la API:** Obtiene el usuario con el token, hace INSERT o UPDATE en `public.profiles` (display_name, avatar_url) usando el cliente con **service_role**.
- **Qué se hizo:** Se quitó cualquier uso de `updated_at` en esa API porque en el esquema actual `profiles` no tiene esa columna.
- **Sigue fallando en producción.** Necesito: ver el mensaje de error real del 500 (logs de Vercel o `console.error` en la ruta) y comprobar que el payload de INSERT/UPDATE solo use columnas que existen en `profiles`.

### 3. GET a Supabase REST (profiles) → 406 (Not Acceptable)

- **Requests:**  
  `GET .../rest/v1/profiles?select=display_name,avatar_url&id=eq.<uuid>`  
  `GET .../rest/v1/profiles?select=onboarding_completed&id=eq.<uuid>`
- **Respuesta:** 406 (Not Acceptable). En PostgREST, 406 suele aparecer cuando se usa `.single()` y la consulta devuelve 0 filas (o más de una). Puede ser por RLS que oculta la fila o porque no existe la fila para ese `id`.
- **Objetivo:** Asegurar que, con el usuario autenticado, exista exactamente una fila en `profiles` para su `id` y que las políticas RLS permitan SELECT (por ejemplo que el usuario pueda ver su propio perfil). Revisar políticas de `profiles` y que el cliente envíe el JWT en esas peticiones.

### 4. POST /api/offers → 500 (Internal Server Error)

- No se pueden crear ofertas. Posibles causas: fallo en el INSERT a `offers` (columna inexistente, restricción, FK a `profiles` si el perfil no existe o está mal referenciado). Hace falta el mensaje de error del servidor (Vercel/logs) para afinar.

---

## Esquema de `public.profiles` (según auditoría reciente)

- id (uuid, PK)
- username (text, nullable, unique)
- avatar_url (text, nullable)
- created_at (timestamptz, default now())
- display_name (text, nullable)
- onboarding_completed (boolean, default false)
- offers_submitted_count, offers_approved_count, offers_rejected_count (integer, default 0)
- display_name_updated_at (timestamptz, default now())

**No hay columna `updated_at` en esta tabla.**

---

## Qué necesito que hagas en el siguiente chat

1. **Prioridad 1 — Registro con Google**  
   Dar SQL o pasos para comprobar/corregir en Supabase:
   - Que el trigger `on_auth_user_created` exista en `auth.users` y llame a `public.handle_new_user()`.
   - Que `handle_new_user()` haga INSERT en `profiles` solo con columnas que existan (id, display_name, avatar_url; y si aplica created_at u otras con default). Que no use `updated_at` ni columnas que no existan.
   - Si hace falta, proponer una versión de `handle_new_user()` que funcione con el esquema actual de `profiles` y ejecutarla en el SQL Editor.

2. **Prioridad 2 — Sync-profile 500**  
   Revisar `app/api/sync-profile/route.ts`: que no envíe `updated_at` ni ninguna columna que no exista en `profiles`. Si en producción el 500 persiste, indicar cómo ver el error exacto (Vercel logs, respuesta de la API) y proponer el cambio.

3. **Prioridad 3 — 406 en perfiles**  
   Revisar dónde se hace `select('display_name', 'avatar_url')` y `select('onboarding_completed')` sobre `profiles` (Navbar, UIProvider u otros). Asegurar que se use la sesión (JWT) y que no se use `.single()` de forma que falle si hay 0 filas; o manejar el caso “sin perfil” sin asumir siempre exactamente una fila.

4. **Prioridad 4 — POST /api/offers 500**  
   Revisar el INSERT en `app/api/offers/route.ts` y que las columnas y valores coincidan con la tabla `offers` en Supabase. Si es posible, incluir en la respuesta de error (o en logs) el mensaje que devuelve Supabase para poder corregir.

---

## Archivos relevantes en el repo

- `app/api/sync-profile/route.ts` — sync Auth → profiles (sin body, solo token).
- `app/auth/callback/route.ts` — callback de OAuth (si existe).
- `app/providers/AuthProvider.tsx` — llama a `/api/sync-profile` y `router.refresh()`.
- `app/api/offers/route.ts` — creación de ofertas.
- `supabase/migrations/001_profiles.sql` — tabla profiles y trigger inicial.
- `supabase/migrations/035_profiles_google_display_name.sql` — función handle_new_user (display_name desde full_name/name).
- `supabase/migrations/040_profiles_trigger_avatar_url.sql` — handle_new_user con avatar_url.
- `docs/supabase-esquema-public.md` — listado de tablas/columnas del esquema public.

---

Con esto, en el nuevo chat podremos atacar en orden: primero “Database error saving new user” y el trigger, luego sync-profile 500, luego 406 en profiles y por último el 500 de ofertas.
