# Prompts para configurar Supabase

Instrucciones en texto para aplicar cambios en Supabase (Dashboard SQL o CLI).

---

## 1. Migración: límite de cambio de nombre (14 días)

Ejecuta en el SQL Editor de Supabase:

```sql
-- Límite de cambio de nombre: una vez cada 14 días
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name_updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.profiles.display_name_updated_at IS 'Última actualización del nombre visible; usado para límite de 14 días entre cambios';
```

---

## 2. Restablecer contraseña (Auth)

Supabase Auth ya incluye `resetPasswordForEmail`. Para que funcione:

1. **URL de redirección:** En Supabase Dashboard → Authentication → URL Configuration, añade a "Redirect URLs":
   - `https://tu-dominio.com/auth/reset-password`
   - En local: `http://localhost:3000/auth/reset-password`

2. **Plantilla de email:** En Authentication → Email Templates, revisa "Reset Password" y asegúrate de que el enlace use la variable `{{ .ConfirmationURL }}`.

3. **No requiere migraciones:** El flujo usa Auth nativo.

---

## 3. Revocar permisos en función de límite de nombre

Si creaste una función `enforce_display_name_change_limit()` con trigger en `profiles`, aplica la revocación para que usuarios no la ejecuten directamente:

```sql
REVOKE EXECUTE ON FUNCTION public.enforce_display_name_change_limit() FROM anon, authenticated;
```

Opcional: para que admins (service_role) puedan cambiar nombres sin límite, añade al inicio de la función:

```sql
IF (auth.jwt() ->> 'role') = 'service_role' THEN RETURN NEW; END IF;
```

---

## 4. Resumen de flujos

| Acción | Dónde | Supabase |
|--------|-------|----------|
| Cambio de nombre | Settings | `profiles.display_name`, `profiles.display_name_updated_at` |
| Restablecer contraseña | Login / Settings | `auth.resetPasswordForEmail()` → email con enlace |
| Nueva contraseña | `/auth/reset-password` | `auth.updateUser({ password })` |

---

## Respuesta a Supabase

**Sí, aplica la revocación.** Ejecuta en el SQL Editor:

```sql
REVOKE EXECUTE ON FUNCTION public.enforce_display_name_change_limit() FROM anon, authenticated;
```

**Para admins:** Si quieres que el rol `service_role` pueda cambiar nombres sin límite, pide a Supabase que añada la excepción al inicio de la función.
