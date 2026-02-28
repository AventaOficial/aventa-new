# Auditoría OAuth y sistema – AVENTA

Fecha: revisión post-OAuth funcionando.  
Checklist: verificación de código (Next.js + Supabase), Supabase Dashboard, Google Cloud y Vercel.

---

## VERIFICACIONES DE CÓDIGO (Next.js + Supabase)

| Verificación | Estado | Detalle |
|-------------|--------|---------|
| Cliente `createBrowserClient` inicializado una sola vez | OK | `lib/supabase/client.ts`: singleton con `let client: SupabaseClient \| null = null`; solo se crea una instancia. |
| No hay múltiples instancias que rompan PKCE | OK | Todos los componentes usan `createClient()` del mismo módulo; PKCE (code_verifier) se mantiene en una sola instancia. |
| Middleware protege rutas privadas | N/A | No existe `middleware.ts`. Rutas privadas se protegen en layout/página (ej. `/admin` en `admin/layout.tsx`, `/me` con `getUser()` y redirect a `/`). |
| Verificación de sesión en layout raíz | Parcial | Layout raíz (`app/layout.tsx`) no comprueba sesión; la lógica está en `AuthProvider` y en layouts de ruta (admin, /me). Para una SPA con rutas públicas y privadas es aceptable. |
| Logout elimina cookies correctamente | OK | `signOut` llama a `createClient().auth.signOut()`; el cliente `@supabase/ssr` usa cookies y Supabase las limpia al cerrar sesión. |
| Rutas server usan `createServerClient` correctamente | Atención | **Callback OAuth:** usa `createServerAuthClient` (cookies, anon key) en `lib/supabase/server-auth.ts`. **API routes:** usan `createServerClient` de `lib/supabase/server.ts`, que usa **SUPABASE_SERVICE_ROLE_KEY** (no cookies). Las API no leen sesión desde cookies; las que requieren usuario validan Bearer token (ej. `requireAdmin` con `getUser(token)`). |
| No hay endpoints que dependan de session sin validarla | OK | Endpoints que requieren usuario usan `Authorization: Bearer` + `getUser(token)` o `requireModeration`/`requireAdmin`. Ninguno confía en session sin validar JWT. |
| Onboarding depende de `onboarding_completed` | OK | `UIProvider` lee `profiles.onboarding_completed` vía Supabase y usa `finalizeOnboarding()` para actualizar la columna; el flujo de cierre del onboarding actualiza `onboarding_completed: true`. |
| RLS activo en tablas sensibles | OK | Migraciones: `profiles` (001), `offers` (034), `offer_votes` (034), `comments`, `offer_events`, `offer_reports`, `moderation_logs` con RLS y políticas. |
| Tabla `profiles` se crea al registrarse | OK | `001_profiles.sql`: trigger `on_auth_user_created` en `auth.users` llama a `handle_new_user()` que hace `INSERT` en `profiles` con `id`, `display_name` (desde metadata o email). |
| Refresh token expirado | OK | El cliente Supabase (`@supabase/ssr`) refresca la sesión automáticamente; no hay lógica manual de refresh en el código. |
| Manejo de errores OAuth en cliente | OK | `AuthProvider.signInWithOAuth` devuelve `error`; en home, si el callback redirige con `?error=...` se muestra toast (missing_code, auth, config). |
| Callback elimina params `error` después de mostrarlos | Mejora | Actualmente la home muestra el toast pero la URL sigue con `?error=...&message=...`. Recomendación: tras mostrar el toast, hacer `router.replace(pathname, { scroll: false })` sin query para limpiar la barra de direcciones. |
| No hay leaks de anon key en logs | OK | Búsqueda en código: no se hace `console.log` del anon key. Solo se usa en headers/fetch y en creación de cliente. |
| Cookies Secure, HttpOnly, SameSite=Lax | Por defecto | El paquete `@supabase/ssr` configura las cookies de sesión; no se sobrescriben opciones en el código. En producción (HTTPS) lo habitual es Secure; HttpOnly y SameSite dependen del default del paquete (revisar documentación @supabase/ssr si se quiere asegurar Lax explícitamente). |

---

## VERIFICACIONES EN SUPABASE (Dashboard)

Comprobar manualmente en el proyecto:

| Verificación | Acción |
|-------------|--------|
| Google provider activo | Authentication → Providers → Google: habilitado. |
| Solo un Client Secret activo | Tras regenerar, el anterior debe estar revocado/eliminado en Google; en Supabase solo el actual. |
| Redirect URLs | Incluir exactamente `https://aventaofertas.com/auth/callback` (y si aplica `http://localhost:3000/auth/callback`). |
| Site URL | `https://aventaofertas.com` sin barra final. |
| RLS en profiles, ofertas, votes | Ya habilitado por migraciones (001, 034). En Dashboard: Table Editor → cada tabla → RLS “Enabled”. |
| RLS en communities | No existe tabla `communities` en las migraciones del repo; si existe en el proyecto, comprobar RLS y políticas en Dashboard. |
| Política: usuarios solo modifican su propio profile | `001_profiles.sql`: política UPDATE con `USING (auth.uid() = id)`. |
| Logs sin errores 500 / sesiones huérfanas | Revisar Authentication → Logs y API logs. |

---

## VERIFICACIONES EN GOOGLE CLOUD

Comprobar manualmente:

| Verificación | Acción |
|-------------|--------|
| OAuth Consent en Production (o Testing con test users) | APIs & Services → OAuth consent screen. |
| Dominio verificado | Donde aplique (Search Console / OAuth). |
| Solo redirect URI de Supabase | Authorized redirect URIs: `https://<project>.supabase.co/auth/v1/callback`. |
| Solo un OAuth client activo para esta app | O varios si están documentados (staging/prod). |
| Client Secret anterior eliminado/revocado | Tras regenerar, el viejo no debe usarse. |

---

## VERIFICACIONES EN VERCEL

Comprobar manualmente:

| Verificación | Acción |
|-------------|--------|
| Variables de entorno | Production (y Preview si aplica): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; para API admin: `SUPABASE_SERVICE_ROLE_KEY`. |
| No variables duplicadas | Settings → Environment Variables: sin duplicados por entorno. |
| No redirect automático www ↔ non-www que altere query | Si hay redirect de www a non-www (o al revés), asegurar que no se pierdan `?code=...` ni `?error=...`. |
| HTTPS forzado | Dominio con SSL; Vercel suele forzar HTTPS. |
| Middleware externo | No middleware en el repo que elimine o reescriba query params. |

---

## RESUMEN

- **Código:** Cliente browser singleton con PKCE, logout correcto, onboarding atado a `onboarding_completed`, RLS y trigger de `profiles` en orden. API usan service_role y validan JWT donde hace falta; no hay dependencia de session sin validar.
- **Mejora sugerida:** Limpiar query params (`error`, `message`) de la URL en home después de mostrar el toast de error OAuth.
- **Supabase / Google / Vercel:** Comprobaciones listadas son de configuración manual en cada panel; el código está alineado con Site URL y Redirect URLs indicados.
