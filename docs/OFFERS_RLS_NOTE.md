# Por qué `expires_at` no persistía en `public.offers`

## Causa más probable

En PostgreSQL se pueden dar permisos **por columna** con `GRANT`:

```sql
REVOKE UPDATE ON TABLE public.offers FROM authenticated;
GRANT UPDATE (status) ON TABLE public.offers TO authenticated;
```

Si el rol que usa la app (p. ej. `authenticated`) tiene **solo** `UPDATE` sobre ciertas columnas (p. ej. `status`) y **no** sobre `expires_at`:

- El cliente envía: `UPDATE offers SET status = 'approved', expires_at = '...'`.
- Postgres/PostgREST puede aplicar solo las columnas permitidas e **ignorar** `expires_at` sin devolver error (o devolver éxito parcial).
- Resultado: `status` se actualiza, `expires_at` sigue NULL.

RLS solo filtra **filas** (qué filas se pueden leer/actualizar). Qué **columnas** puede escribir el rol lo define `GRANT UPDATE (col1, col2, ...)`.

## Cómo comprobarlo en Supabase

En **SQL Editor** (como superuser):

```sql
-- Ver políticas RLS de offers
SELECT * FROM pg_policies WHERE tablename = 'offers';

-- Ver permisos por columna (roles con UPDATE en offers)
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'offers' AND privilege_type = 'UPDATE';
```

Si `authenticated` tiene `UPDATE` solo en `status` (o en unas pocas columnas) y no en `expires_at`, ahí está la causa.

## Solución aplicada en AVENTA (backend-first)

Se usa una **API route con `service_role`** para la moderación:

- **`POST /api/admin/moderate-offer`**: recibe `{ id, status }`, hace el `UPDATE` con el cliente de servidor (service_role), que **no** está limitado por RLS ni por GRANT por columna.
- En aprobación: si `expires_at` es NULL, se setea `now() + 7 days`.
- La UI de moderación solo llama a esta API; no hace `update` directo desde el cliente.

Ventajas: no depende de cómo estén definidas las políticas o los GRANT de `offers`, bajo mantenimiento, consistente con enfoque backend-first.

## Alternativa (opcional): arreglar RLS/GRANT

Si prefieres que el cliente pueda escribir `expires_at` con el rol `authenticated`, puedes dar permiso explícito (ejecutar en Supabase SQL Editor):

```sql
-- Permitir a authenticated actualizar también expires_at al aprobar
GRANT UPDATE (status, expires_at) ON TABLE public.offers TO authenticated;
-- O, si quieres permitir todas las columnas necesarias para moderación:
-- GRANT UPDATE ON TABLE public.offers TO authenticated;
```

Aun así, la app sigue usando la API para la moderación; este GRANT sería solo por si en el futuro quisieras hacer updates directos desde el cliente.
