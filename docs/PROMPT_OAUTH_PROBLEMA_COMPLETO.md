# Prompt completo: problema OAuth Google sin código en callback

Copia todo el bloque siguiente (desde "---" hasta el final) y pégalo en la IA que vayas a consultar.

---

## Contexto del proyecto

- **App:** AVENTA, comunidad de cazadores de ofertas.
- **Stack:** Next.js 16, React 19, Supabase (auth + DB), despliegue en Vercel.
- **Dominio producción:** https://aventaofertas.com
- **Proveedor OAuth:** solo Google, usando Supabase Auth.

## Problema

Al hacer clic en "Continuar con Google":

1. El usuario es redirigido correctamente a Google y puede elegir su cuenta.
2. Tras autorizar, Supabase recibe el callback de Google (el flujo llega hasta Supabase).
3. La app recibe al usuario de vuelta, pero **no llega el parámetro `code`** en la URL del callback.
4. El Route Handler de la app en `GET /auth/callback` no recibe `code`, redirige a `/?error=missing_code` y se muestra al usuario: "No se recibió el código de Google. Vuelve a intentar iniciar sesión."

Es decir: **Supabase está redirigiendo a nuestra URL de callback, pero la petición que llega a nuestro servidor no incluye el query parameter `code`.** No sabemos si Supabase no lo envía, o si algo (proxy, redirect intermedio, etc.) lo pierde antes de que nuestra ruta lo reciba.

## Configuración actual

### Google Cloud Console

- **Tipo de cliente:** OAuth 2.0 Client ID, Web application.
- **Authorized JavaScript origins:** `https://aventaofertas.com`
- **Authorized redirect URIs:** `https://mkgsrpsuvedwwlzmzmzh.supabase.co/auth/v1/callback` (callback de Supabase, no de nuestra app).
- Client ID y Client Secret están configurados en Supabase.

### Supabase Dashboard

- **Authentication → Providers → Google:** habilitado, con el mismo Client ID y Client Secret de Google.
- **Authentication → URL Configuration:**
  - **Site URL:** `https://aventaofertas.com` (o similar, sin barra final).
  - **Redirect URLs:** incluye `https://aventaofertas.com/auth/callback` (añadido explícitamente para que Supabase redirija ahí tras el OAuth).

### Código relevante (resumido)

**Inicio del flujo (cliente):**  
Al hacer clic en "Continuar con Google" se llama a:

```ts
const origin = window.location.origin  // https://aventaofertas.com
const { data, error } = await createClient().auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${origin}/auth/callback` },
})
if (data?.url) window.location.href = data.url
```

Es decir, `redirectTo` es **exactamente** `https://aventaofertas.com/auth/callback`.

**Cliente Supabase (navegador):**  
Se usa `@supabase/ssr` con `createBrowserClient(url, anonKey, { auth: { flowType: 'pkce' } })` para forzar flujo PKCE y que Supabase devuelva un `code` en la URL (no flujo implícito con hash).

**Callback en el servidor (Next.js App Router):**  
Ruta: `app/auth/callback/route.ts` (GET). No hay `page.tsx` en la misma ruta para evitar conflicto.

- Lee `code` con `requestUrl.searchParams.get('code')`.
- Si no hay `code`, redirige a `/?error=missing_code` (y el usuario ve el mensaje de "No se recibió el código de Google").
- Si hay `code`, crea un cliente Supabase en servidor con cookies (`createServerAuthClient` que usa `getAll`/`setAll` con la cookie store de Next.js), llama a `exchangeCodeForSession(code)` y, si todo va bien, redirige a `/`.

**Cliente Supabase en servidor:**  
`createServerClient` de `@supabase/ssr` con opciones de cookies: `getAll` devuelve las cookies de la petición, `setAll` escribe en la respuesta (Next.js `cookies()`). Se usa para poder leer el `code_verifier` (PKCE) de las cookies y escribir la sesión en cookies en la respuesta del redirect.

## Lo que ya se ha intentado

1. Añadir en Supabase Redirect URLs exactamente `https://aventaofertas.com/auth/callback` (sin barra final).
2. Forzar en el cliente `flowType: 'pkce'` en `createBrowserClient` para que Supabase use PKCE y se espere un `code` en query string.
3. Comprobar que en Google Cloud el redirect URI sea el de Supabase (`...supabase.co/auth/v1/callback`), no el de nuestra app.
4. Tener un único manejador del callback (Route Handler), sin página que compita en la misma ruta.

Aun así, la petición que llega a `GET /auth/callback` **no trae el parámetro `code`**, por eso siempre se redirige a `/?error=missing_code`.

## Pregunta para la IA

¿Por qué Supabase podría estar redirigiendo a `https://aventaofertas.com/auth/callback` **sin** añadir el query parameter `code` a la URL, y qué hay que revisar o cambiar (en Supabase, en Google Cloud, en el código Next.js/Supabase o en la infraestructura/Vercel) para que el `code` llegue al Route Handler y el login con Google funcione de punta a punta?

Incluye posibles causas (ej. configuración de Supabase, tipo de flujo, formato de Redirect URL, proxies, redirecciones intermedias, cookies) y pasos concretos de comprobación o corrección.

---

*Fin del prompt. Copiar desde el primer "---" hasta este "---".*
