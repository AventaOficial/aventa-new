# STAGING ENVIRONMENT CONTRACT (definitive)

**Status:** ACTIVE CONTRACT — legacy project promoted to staging  
**Date:** 2026-09-17  
**Related:** `AUDIT_staging_environment_forensics.md`, `STAGING_LEGACY_PROJECT_AUDIT.md`, `DISTRIBUTION_ENGINE_P0D2_PREFLIGHT_STOP.md`

---

## 1. Production project-ref

| Field | Value |
|-------|--------|
| **Project-ref** | `mkgsrpsuvedwwlzmzmzh` |
| Host | `https://mkgsrpsuvedwwlzmzmzh.supabase.co` |
| Role | **PRODUCTION only** — real data |
| Protection | Staging scripts/tests abort if this ref is detected |

---

## 2. Staging project-ref

| Field | Value |
|-------|--------|
| **Project-ref** | `oojshofrpbfwsiypcecr` |
| Host | `https://oojshofrpbfwsiypcecr.supabase.co` |
| Former name | AventaOficial's Project (prototipo 2025) |
| Role | **Official STAGING** — synthetic / rehearsal |
| Note | Promoted from legacy. **Not** a third environment. |

---

## 3. Development project-ref

| Field | Value |
|-------|--------|
| **Project-ref** | Same as staging: `oojshofrpbfwsiypcecr` |
| Role | Local/dev uses staging DB |
| Exception | `AVENTA_ALLOW_LOCAL_PRODUCTION=1` only (explicit, discouraged) |

---

## 4. Vercel environment mapping

| Vercel target | `VERCEL_ENV` | Required Supabase |
|---------------|--------------|-------------------|
| Production | `production` | `mkgsrpsuvedwwlzmzmzh` |
| Preview | `preview` | `oojshofrpbfwsiypcecr` |
| Development | `development` / unset | `oojshofrpbfwsiypcecr` |

**`VERCEL_ENV` alone does not change DB** — Preview must have **Preview-scoped** env vars with staging URL/keys in the Vercel dashboard (founder action).

---

## 5. Supabase mapping

```
DEV/LOCAL  →  oojshofrpbfwsiypcecr  (staging)
PREVIEW    →  oojshofrpbfwsiypcecr  (staging)
PRODUCTION →  mkgsrpsuvedwwlzmzmzh  (production)

Legacy as third env: DOES NOT EXIST
```

---

## 6. Secrets mapping (names only)

Same variable **names**, different **values** per environment:

| Variable | Production | Staging / Local / Preview |
|----------|------------|---------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | prod host | `https://oojshofrpbfwsiypcecr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon | staging anon |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service | staging service |
| `CRON_SECRET` | prod | distinct staging value recommended |
| `AVENTA_EXPECTED_SUPABASE_REF` | `mkgsrpsuvedwwlzmzmzh` | `oojshofrpbfwsiypcecr` |
| `AVENTA_SUPABASE_TARGET` | `production` (optional) | `staging` (optional) |
| `TELEGRAM_BOT_TOKEN_*` | never staging bots | test bots only (when D2) |
| `DISTRIBUTION_ENGINE_ENABLED` | false | false until D2 |

Never hardcode secret values in git.

Preferred local file: `.env.staging.local` (gitignored) **or** `.env.local` pointed at staging.

---

## 7. Migration policy

1. Author SQL in `docs/supabase-migrations/`.  
2. Apply to **staging** (`oojshofrpbfwsiypcecr`) first — never prod first.  
3. Verify schema/RLS.  
4. Apply to **production** only with explicit founder approval.  
5. Record environment + ref in `MIGRATION_*.md`.

Code guard: `lib/supabase/projectRefs.ts` + `createServerClient` / `createServerAuthClient`.  
Script guard: `scripts/lib/supabaseProjectRefs.mjs` → `assertStagingSupabaseUrl`.

---

## 8. Seed policy

| Env | Seeds |
|-----|--------|
| Production | Ops-approved only |
| Staging | Synthetic / QA; Distribution seeds only after D2 unblock |
| Local | Same as staging |

**No DROP/TRUNCATE without founder approval.** Legacy historical rows on staging: preserve until audited (see legacy audit).

---

## 9. Test data policy

- Synthetic markers: `meta.staging_qa`, `@aventa-staging.test`, `staging-qa-*`  
- Staging write QA must call `assertStagingSupabaseUrl`  
- `STAGING_MANUAL_QA=1` only against `oojshofrpbfwsiypcecr`

---

## 10. Forbidden cross-environment access

| Forbidden |
|-----------|
| Staging scripts → `mkgsrpsuvedwwlzmzmzh` |
| Local default → production (without `AVENTA_ALLOW_LOCAL_PRODUCTION=1`) |
| Preview → production keys (once Preview reconfigured) |
| Treating “legacy” as a third live environment |

---

## 11. Verification checklist

- [ ] Founder sets Vercel **Preview** env → staging URL/keys  
- [ ] Founder confirms Vercel **Production** env → prod only  
- [ ] Local `.env.local` or `.env.staging.local` → staging (not prod)  
- [ ] `node scripts/verify-rewards-staging.mjs` aborts on prod URL  
- [ ] `createServerClient` throws if local URL is prod without allow flag  
- [ ] Guard unit tests green  
- [ ] Legacy data decision (keep / archive export) documented  

**Isolation verifiable** = checklist items above done. Until then P0-D2 remains BLOCKED for remote apply/adapter.

Founder switch guide: [`STAGING_FOUNDER_ENV_SWITCH.md`](./STAGING_FOUNDER_ENV_SWITCH.md)  
Legacy data audit: [`STAGING_LEGACY_PROJECT_AUDIT.md`](./STAGING_LEGACY_PROJECT_AUDIT.md)

---

## 12. Code entry points

| Piece | Path |
|-------|------|
| Refs + assert | `lib/supabase/projectRefs.ts` |
| Script assert | `scripts/lib/supabaseProjectRefs.mjs` |
| Server clients | `lib/supabase/server.ts`, `server-auth.ts` |
| Rewards staging script | `scripts/verify-rewards-staging.mjs` |
| Rewards staging test | `tests/rewards/stagingManualQa.integration.test.ts` |

---

## 13. P0-D2 Distribution

Still **BLOCKED** for Telegram/drain/cron/hop/seeds/remote migration until:

1. Local no longer defaults to production credentials  
2. Vercel Preview staging vars confirmed by founder  
3. Staging schema readiness for distribution tables assessed  

Contract refs are fixed; isolation must still be **verified** operationally.
