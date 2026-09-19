# S7.2.1 — Auth Staging Repair

## Root cause

Staging `public.handle_new_user()` was **not** `SECURITY DEFINER`.

Auth path:

```
auth.admin.createUser
  → INSERT auth.users
  → trigger on_auth_user_created
  → public.handle_new_user()
  → INSERT public.profiles
```

On staging:

| Fact | Value |
|---|---|
| `profiles` RLS | **ON** |
| INSERT policy on `profiles` | **none** |
| `supabase_auth_admin.rolbypassrls` | **false** |
| staging `handle_new_user` SECURITY DEFINER | **false** (before fix) |
| production `handle_new_user` SECURITY DEFINER | **true** (canonical) |

Result: trigger insert blocked by RLS → Auth returns `Database error creating new user`.

## Fix applied (staging only)

File: `docs/supabase-migrations/S721_STAGING_HANDLE_NEW_USER_SECURITY_DEFINER.sql`

Applied to project `oojshofrpbfwsiypcecr` via:

`npx supabase db query --linked --project-ref oojshofrpbfwsiypcecr --experimental -f …`

Aligned with production: `SECURITY DEFINER`, metadata → `display_name`/`avatar_url`, explicit `role='user'`, `unique_violation` swallow for sync-profile races.

## Machine author provisioned

| Field | Value |
|---|---|
| UUID | `778cfbf5-294e-4866-883f-71e3046566cb` |
| email | `machine-supply-staging@aventa.internal` |
| role | `user` |
| display_name | `Aventa Machine Supply (staging)` |
| ≠ S7.1 seed | yes |

## Not done (by design)

- No `s72-controlled-staging-supply.ts --execute`
- No machine writes activation
- No Distribution / Rewards / Economy / Attribution
- No production changes

## Next

Resume S7.2 controlled window:

`npx tsx scripts/s72-controlled-staging-supply.ts --execute --cap=5`
