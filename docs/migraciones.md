# SQL para Supabase — AVENTA Moderación y Roles

Ejecuta estas migraciones en orden desde el **SQL Editor** de Supabase (Dashboard → SQL Editor).

---

## 1. Roles y permisos (022)

```sql
-- Copiar y ejecutar el contenido de: supabase/migrations/022_user_roles_and_permissions.sql
```

**Después de ejecutar:** Asigna tu rol de owner:

```sql
-- Reemplaza TU_USER_ID con tu UUID de auth.users
INSERT INTO public.user_roles (user_id, role)
VALUES ('TU_USER_ID'::uuid, 'owner')
ON CONFLICT (user_id, role) DO UPDATE SET role = 'owner';
```

Para asignar otros roles:

```sql
-- Moderador (solo moderación)
INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_ID_MODERADOR'::uuid, 'moderator')
ON CONFLICT (user_id, role) DO NOTHING;

-- Analista (solo métricas)
INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_ID_ANALISTA'::uuid, 'analyst')
ON CONFLICT (user_id, role) DO NOTHING;
```

---

## 2. risk_score y rejection_reason (023)

```sql
-- Copiar y ejecutar: supabase/migrations/023_offers_risk_score_rejection.sql
```

---

## 3. Logs de moderación (024)

```sql
-- Copiar y ejecutar: supabase/migrations/024_moderation_logs.sql
```

---

## 4. Sistema de reportes (025)

```sql
-- Copiar y ejecutar: supabase/migrations/025_reports_table.sql
```

---

## 5. user_trust_score (026)

```sql
-- Copiar y ejecutar: supabase/migrations/026_profiles_trust_score.sql
```

---

## 6. Share en offer_events (027)

```sql
-- Copiar y ejecutar: supabase/migrations/027_offer_events_share.sql
```

---

## 7. Shares en offer_performance_metrics (028)

```sql
-- Copiar y ejecutar: supabase/migrations/028_offer_performance_metrics_shares.sql
```

---

## Resumen de roles

| Rol | Acceso |
|-----|--------|
| **owner** | Todo (dueño) |
| **admin** | Todo |
| **moderator** | Pendientes, Aprobadas, Rechazadas, Reportes, Usuarios, Logs |
| **analyst** | Métricas, Health |

---

## Orden recomendado

1. `022_user_roles_and_permissions.sql`
2. Asignar tu rol owner
3. `023_offers_risk_score_rejection.sql`
4. `024_moderation_logs.sql`
5. `025_reports_table.sql`
6. `026_profiles_trust_score.sql`
7. `027_offer_events_share.sql`
8. `028_offer_performance_metrics_shares.sql`
