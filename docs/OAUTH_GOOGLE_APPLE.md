# Iniciar sesión con Google (Supabase)

La app usa **solo Google** para OAuth. Para que "Continuar con Google" funcione, hay que conectar el proveedor en Supabase.

## 0. ¿Qué tipo de credencial crear?

En Google Cloud, al pulsar **Create Credentials** (Crear credenciales) te salen varias opciones:

- **Clave de API** → No. No es para login de usuarios.
- **ID de cliente de OAuth** → **Sí.** Elige esta.
- **Cuenta de servicio** → No. Es para servidor a servidor.
- **Ayúdame a elegir** → Puedes usarla; al final te llevará a crear un **OAuth client ID**.

Elige **ID de cliente de OAuth** (en inglés: *OAuth client ID*).

## 1. Google Cloud Console

1. Entra en [Google Cloud Console](https://console.cloud.google.com).
2. Crea un proyecto (o elige uno existente).
3. **APIs & Services** → **Credentials** → **Create Credentials** → **ID de cliente de OAuth** (OAuth 2.0 Client ID).
4. Si te pide configurar la pantalla de consentimiento, crea una **OAuth consent screen** (tipo "External" está bien para pruebas).
5. Tipo de cliente: **Web application**.
6. En **Authorized redirect URIs** añade la URL de callback de Supabase. La encuentras en Supabase en el paso siguiente; tiene la forma:
   - `https://<TU-PROYECTO>.supabase.co/auth/v1/callback`
7. Copia el **Client ID** y el **Client Secret**.

## 2. Supabase Dashboard

1. Entra en [app.supabase.com](https://app.supabase.com) → tu proyecto.
2. **Authentication** → **Providers**.
3. Activa **Google**.
4. Pega el **Client ID** y **Client Secret** de Google.
5. Guarda.

## 3. URLs de redirección (Supabase)

En **Authentication** → **URL Configuration**:

- **Site URL**: tu dominio en producción (ej. `https://aventaofertas.com`).
- **Redirect URLs**: añade **la URL de callback** (obligatoria para que "Continuar con Google" funcione):
  - `https://aventaofertas.com/auth/callback`
  - `http://localhost:3000/auth/callback` (desarrollo)
  - Opcionalmente también: `https://aventaofertas.com/**` y `http://localhost:3000/**`

Sin la URL `/auth/callback`, Supabase no puede devolver el código de autorización y el login con Google falla.

## 4. Comportamiento en la app

- Al hacer clic en "Continuar con Google", la app redirige a Google y luego Supabase redirige a **/auth/callback** con un código. El **Route Handler** (`app/auth/callback/route.ts`) intercambia el código por la sesión en el servidor, escribe las cookies y redirige al usuario a la home ya autenticado.
- Si el usuario es nuevo, Supabase crea la sesión; con los triggers en la base de datos se crea el perfil en `profiles`. El onboarding se gestiona en la app según `profiles.onboarding_completed`.

## 5. Si "Continuar con Google" no termina de crear/iniciar sesión

1. **Consola del navegador** (antes de hacer clic en Google): comprobar que no haya errores al llamar a `signInWithOAuth` y que se produzca el redirect a Google.
2. **Pestaña Network**: tras elegir la cuenta en Google, verificar que haya un redirect a `https://aventaofertas.com/auth/callback?code=...` (o `http://localhost:3000/auth/callback?code=...`) y que la respuesta sea un **redirect 307/302** a `/` (no un 200 con HTML). Si ves 200 con HTML, el Route Handler podría no estar ejecutándose.
3. **URL tras el callback**: si acabas en `/?error=missing_code` es que no llegó el `code`; si es `/?error=auth&message=...` el mensaje indica el fallo de Supabase (p. ej. código ya usado o expirado).
4. **Supabase → Authentication → Logs**: revisar si hay intentos de login con Google y si el exchange de código falla (invalid_grant, etc.).
5. **Redirect URLs en Supabase**: deben incluir exactamente `https://aventaofertas.com/auth/callback` y `http://localhost:3000/auth/callback` (sin barra final).
6. **Cookies**: el flujo PKCE guarda un `code_verifier` en cookie antes de ir a Google; al volver a `/auth/callback` esa cookie debe enviarse. Comprobar en DevTools → Application → Cookies que existan cookies del dominio (por ejemplo `sb-...`) tras el callback.

## Resumen

Solo hay que **activar Google en Supabase** y rellenar Client ID y Client Secret que obtienes de Google Cloud Console, más configurar Site URL y Redirect URLs. No hace falta tocar código si las variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) ya están en Vercel.
