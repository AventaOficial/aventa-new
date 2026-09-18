# LOCAL / VERCEL ENV SWITCH — founder actions

Production remains `mkgsrpsuvedwwlzmzmzh` (do not change Production env vars).

**Live status (2026-09-17 resume):** `.env.local` → **staging** `oojshofrpbfwsiypcecr` (verified).  
Inventory: `STAGING_SCHEMA_DRIFT.md` (REST read-only; distribution tables **MISSING**).

## 1. Local (required) — exact variables

From Supabase Dashboard → **oojshofrpbfwsiypcecr** → Settings → API, set in `.env.local` **and/or** `.env.staging.local`:

| Variable | Must be |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oojshofrpbfwsiypcecr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service_role key |
| `AVENTA_EXPECTED_SUPABASE_REF` | `oojshofrpbfwsiypcecr` |
| `AVENTA_SUPABASE_TARGET` | `staging` |

Optional: copy `.env.staging.local.example` → `.env.staging.local` first.

**Do not** invent keys. **Do not** paste secrets into git or chat.

Verify:

```bash
node scripts/verify-rewards-staging.mjs
```

Must not say `ABORT: ... PRODUCTION`.

## 2. Vercel Preview (required for Preview→staging)

In Vercel → Project → Settings → Environment Variables:

| Variable | Production | Preview |
|----------|------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | prod host | `https://oojshofrpbfwsiypcecr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod | staging anon |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | staging service |
| `CRON_SECRET` | prod | **distinct** staging secret |
| `AVENTA_EXPECTED_SUPABASE_REF` | `mkgsrpsuvedwwlzmzmzh` | `oojshofrpbfwsiypcecr` |

`VERCEL_ENV=preview` alone does **not** switch DB — Preview-scoped values are mandatory.

## 3. Do not

- Put staging Telegram bots in Production.  
- Apply migrations to production as “staging test”.  
- Wipe legacy staging data without written approval (`STAGING_LEGACY_PROJECT_AUDIT.md`).
