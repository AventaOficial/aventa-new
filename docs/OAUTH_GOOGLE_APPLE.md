# Iniciar sesión con Google y Apple (Supabase)

La app ya tiene los botones "Continuar con Google" y "Continuar con Apple". Para que funcionen, debes configurar los proveedores en Supabase y añadir la URL de tu sitio en las URLs de redirección.

## 1. Supabase Dashboard

1. Entra en [app.supabase.com](https://app.supabase.com) → tu proyecto.
2. **Authentication** → **Providers**.
3. Activa **Google** y **Apple** y rellena lo que pida cada uno.

### Google

- Necesitas crear un proyecto en [Google Cloud Console](https://console.cloud.google.com).
- En **APIs & Services** → **Credentials** crea unas **OAuth 2.0 Client ID** (tipo "Web application").
- Añade en **Authorized redirect URIs** la URL que te indique Supabase (algo como `https://xxxx.supabase.co/auth/v1/callback`).
- Copia **Client ID** y **Client Secret** en Supabase (Provider Google).

### Apple

- Necesitas cuenta de [Apple Developer](https://developer.apple.com).
- En **Certificates, Identifiers & Profiles** → **Identifiers** crea un **Services ID** y configura **Sign In with Apple**.
- Crea una **Key** para Sign in with Apple y configura el **Client ID**, **Team ID**, **Key ID** y el archivo **.p8** en Supabase (Provider Apple).
- La **Redirect URL** que uses en Apple debe ser la misma que la de Supabase (`https://xxxx.supabase.co/auth/v1/callback`).

## 2. URLs de redirección en Supabase

En **Authentication** → **URL Configuration**:

- **Site URL**: tu dominio en producción (ej. `https://aventa-new.vercel.app` o `https://tudominio.com`).
- **Redirect URLs**: añade:
  - `https://aventa-new.vercel.app/**`
  - `https://tudominio.com/**`
  - `http://localhost:3000/**` (para desarrollo)

Sin esto, Supabase puede rechazar el redirect después del login y dar error.

## 3. Comportamiento en la app

- Al hacer clic en "Continuar con Google" o "Continuar con Apple", la app redirige a Supabase y luego al proveedor; al terminar, el usuario vuelve a tu **Site URL** ya autenticado.
- Si el usuario es nuevo, Supabase crea la sesión y, con los triggers que tengas, se puede crear el perfil en `profiles` (por ejemplo con el `id` del usuario y el `email` o `display_name` que devuelva el proveedor).
