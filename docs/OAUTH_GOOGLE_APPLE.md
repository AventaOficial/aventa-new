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

- **Site URL**: tu dominio en producción (ej. `https://aventa-new.vercel.app` o `https://tudominio.com`).
- **Redirect URLs**: añade:
  - `https://aventa-new.vercel.app/**`
  - `https://tudominio.com/**`
  - `http://localhost:3000/**` (desarrollo)

Sin estas URLs, Supabase puede rechazar el redirect después del login.

## 4. Comportamiento en la app

- Al hacer clic en "Continuar con Google", la app redirige a Google y luego a Supabase; al terminar, el usuario vuelve a tu **Site URL** ya autenticado.
- Si el usuario es nuevo, Supabase crea la sesión; con los triggers que tengas en la base de datos, se puede crear el perfil en `profiles` (por ejemplo con el `id` del usuario y el `email` o `display_name` que devuelva Google).

## Resumen

Solo hay que **activar Google en Supabase** y rellenar Client ID y Client Secret que obtienes de Google Cloud Console, más configurar Site URL y Redirect URLs. No hace falta tocar código si las variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) ya están en Vercel.
