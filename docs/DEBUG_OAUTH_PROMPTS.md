# Prompts y pasos para depurar "Continuar con Google" que no termina de crear sesión

## 1. Prompt para Supabase (Dashboard / soporte / logs)

Copia y pega o adapta cuando revises en Supabase:

---

**Contexto:** App Next.js 16 en Vercel (dominio aventaofertas.com). Login con Google vía Supabase Auth. El botón "Continuar con Google" redirige a Google y luego Supabase devuelve a nuestra URL de callback; pese a eso, la sesión no se crea o no se persiste en el cliente.

**Qué necesito comprobar en Supabase:**

1. **Authentication → URL Configuration**
   - Site URL: ¿está en `https://aventaofertas.com` (sin barra final)?
   - Redirect URLs: ¿incluye exactamente `https://aventaofertas.com/auth/callback` y `http://localhost:3000/auth/callback` (sin barra final)? ¿Hay alguna typo o variante (http vs https, con/sin trailing slash)?

2. **Authentication → Providers → Google**
   - ¿Está el proveedor Google habilitado?
   - ¿El Client ID y Client Secret son los de la misma aplicación de Google Cloud que tiene en "Authorized redirect URIs" la URL de callback de Supabase (`https://<PROYECTO>.supabase.co/auth/v1/callback`)?

3. **Authentication → Logs**
   - Al hacer clic en "Continuar con Google" y volver de Google, ¿aparece algún intento de login (éxito o error)?
   - Si hay error: ¿cuál es el mensaje/código (p. ej. `invalid_grant`, `redirect_uri_mismatch`, código ya usado, etc.)?

4. **Comportamiento esperado**
   - Nuestra app redirige a `redirectTo: https://aventaofertas.com/auth/callback`. Supabase debe redirigir a esa URL con `?code=...` (y opcionalmente `&next=...`). ¿En los logs se ve que el exchange de código se intenta y falla o ni siquiera llega?

Respóndeme con: estado de Site URL y Redirect URLs, si Google está habilitado, y cualquier error que aparezca en Authentication → Logs al probar "Continuar con Google".

---

## 2. Prompt para Google Cloud (Console / soporte)

Copia y pega o adapta cuando revises en Google Cloud:

---

**Contexto:** OAuth 2.0 para "Continuar con Google" en una app web (Next.js en Vercel, dominio aventaofertas.com). El flujo pasa por Supabase Auth; Supabase redirige a los usuarios a nuestra app con un código.

**Qué necesito comprobar en Google Cloud Console:**

1. **APIs & Services → Credentials**
   - Tengo un **OAuth 2.0 Client ID** tipo "Web application". ¿Es el mismo que está configurado en Supabase (Authentication → Providers → Google)?

2. **Authorized redirect URIs** de ese cliente OAuth
   - Debe estar **exactamente** la URL de callback de Supabase: `https://<MI-PROYECTO>.supabase.co/auth/v1/callback` (sustituir `<MI-PROYECTO>` por el subdominio del proyecto en Supabase). Sin barra final, mismo protocolo (https).
   - ¿Hay alguna otra URI que pueda estar interfiriendo o que falte para producción?

3. **APIs & Services → OAuth consent screen**
   - ¿La pantalla de consentimiento está en estado "Testing" o "Production"? Si está en Testing, ¿el correo con el que pruebas está en "Test users"?
   - ¿Hay algún mensaje de "app no verificada" que bloquee el login para algunos usuarios?

4. **Errores típicos**
   - Si al volver de Google la app recibe `error=auth` o en Supabase aparece `invalid_grant`: suele ser código ya usado, expirado, o redirect_uri no coincidente entre Google y Supabase.
   - ¿En la petición que hace Supabase a Google (o en los logs de Google Cloud si tienes acceso) se ve algún error de redirect_uri o consent?

Respóndeme con: confirmación de que el redirect URI del cliente OAuth coincide con la URL de callback de Supabase, estado del consent screen, y si hay restricciones (dominios, usuarios de prueba) que puedan afectar.

---

## 3. Pasos en Vercel (revisión manual)

Haz estas comprobaciones en el dashboard de Vercel (proyecto vinculado a aventa-new):

1. **Deployments**
   - Abre el último deployment (el que falló o el último exitoso). Revisa la pestaña "Building": si el build falla, el mensaje de error aparece ahí (p. ej. "Command npm run build exited with 1" y el detalle de TypeScript o Turbopack).

2. **Settings → Environment Variables**
   - Comprueba que en **Production** (y Preview si aplica) existan:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - No hace falta que tengas el valor visible; basta con que las variables estén definidas. Si faltan, el callback puede redirigir con `?error=config`.

3. **Settings → Domains**
   - Verifica que `aventaofertas.com` (y www si lo uses) esté asignado al proyecto y que SSL esté activo (HTTPS). El redirect de OAuth debe ir a HTTPS en producción.

4. **Redeploy tras cambios**
   - Si cambias variables de entorno, haz "Redeploy" del último deployment sin cambiar código para que tome las nuevas env vars.
   - Si cambias código, un nuevo push a la rama conectada (p. ej. master) dispara un nuevo build; revisa que el build termine en éxito antes de probar de nuevo el login con Google.

5. **Logs en tiempo real (opcional)**
   - En el deployment, pestaña "Functions" o "Logs": si puedes, reproduce "Continuar con Google" y mira si hay logs del Route Handler `/auth/callback` (errores de exchange o redirect). No todos los planes muestran logs detallados.

---

---

## 4. "No se recibió el código de Google"

Si Supabase ya tiene en Redirect URLs `https://aventaofertas.com/auth/callback` y aun así sale ese mensaje, el cliente debe usar **flujo PKCE** para que Supabase devuelva el `code` en la URL (y no use flujo implícito con hash). En `lib/supabase/client.ts` el `createBrowserClient` debe llevar:

```ts
createBrowserClient(url, key, {
  auth: { flowType: 'pkce' },
})
```

Comprueba también que en Supabase → URL Configuration la URL sea exactamente `https://aventaofertas.com/auth/callback` (sin barra final, sin espacio). Si tras el cambio sigues sin recibir el código, en la pestaña Network revisa la petición a `/auth/callback`: ¿llega con `?code=...` o sin parámetros?

---

*Este archivo es solo referencia; no modifica el diseño de la app.*
