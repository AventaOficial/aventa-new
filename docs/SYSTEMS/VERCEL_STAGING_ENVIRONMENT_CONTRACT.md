# VERCEL STAGING ENVIRONMENT CONTRACT

**Status:** PREPARATION (P0-D3.3) — project not created yet  
**Date:** 2026-09-17  
**Related:** `STAGING_ENVIRONMENT_CONTRACT.md`, `P0D3_2_VERCEL_CRON_FORENSICS.md`

---

## 1. Project matrix

| ENVIRONMENT | VERCEL PROJECT | SUPABASE REF | APP URL (target) |
|-------------|----------------|--------------|------------------|
| **Production** | `aventa-new` | `mkgsrpsuvedwwlzmzmzh` | `https://aventaofertas.com` |
| **Staging** | `aventa-staging` (**to create**) | `oojshofrpbfwsiypcecr` | `https://staging.aventaofertas.com` (preferred) or `*.vercel.app` |

**Rule:** Physical separation. One Vercel project must never hold both Production and Staging Distribution cron.

---

## 2. Why a separate project

Vercel Cron runs **only** on each project’s **Production** deployment (`VERCEL_ENV=production` for that project).

| Approach | Result |
|----------|--------|
| Add `distribution-drain` to `aventa-new` `vercel.json` | Hits `aventaofertas.com` → **FORBIDDEN** |
| Preview URL + Vercel Cron | **Unsupported** by platform |
| Dedicated `aventa-staging` Production deploy | Cron hits staging app URL → **CORRECT** |

On `aventa-staging`, `VERCEL_ENV=production` means “Production deploy of the **staging** project”, not “Aventa Production”. Isolation markers:

```text
AVENTA_DEPLOYMENT_SURFACE=staging
AVENTA_SUPABASE_TARGET=staging
AVENTA_EXPECTED_SUPABASE_REF=oojshofrpbfwsiypcecr
NEXT_PUBLIC_SUPABASE_URL=https://oojshofrpbfwsiypcecr.supabase.co
```

Drain aborts unless **all** staging surface checks pass. Production project must **never** set `AVENTA_DEPLOYMENT_SURFACE=staging`.

---

## 3. Environment variables

### Production (`aventa-new`) — do not change Distribution flags

| Variable | Value |
|----------|--------|
| `AVENTA_SUPABASE_TARGET` | `production` |
| `AVENTA_EXPECTED_SUPABASE_REF` | `mkgsrpsuvedwwlzmzmzh` |
| `AVENTA_DEPLOYMENT_SURFACE` | `production` (or unset — never `staging`) |
| `DISTRIBUTION_ENGINE_ENABLED` | `false` |
| `NEXT_PUBLIC_SUPABASE_URL` | production host |
| `CRON_SECRET` | **production-only** secret |
| `TELEGRAM_BOT_TOKEN_STAGING` | **must be unset** |

### Staging (`aventa-staging`) — founder provisions

| Variable | Value |
|----------|--------|
| `AVENTA_SUPABASE_TARGET` | `staging` |
| `AVENTA_EXPECTED_SUPABASE_REF` | `oojshofrpbfwsiypcecr` |
| `AVENTA_DEPLOYMENT_SURFACE` | `staging` |
| `DISTRIBUTION_ENGINE_ENABLED` | `false` initially |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oojshofrpbfwsiypcecr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role |
| `CRON_SECRET` | **new staging-only** secret (≠ production) |
| `TELEGRAM_BOT_TOKEN_STAGING` | staging bot token |
| `TELEGRAM_STAGING_CHAT_ID` | staging chat id (ops reference; DB destination key already set) |
| `NEXT_PUBLIC_APP_URL` | staging public origin (hop CTAs) |

**Never** commit real values. **Never** copy production `CRON_SECRET` / service role / Telegram prod tokens.

---

## 4. Secret isolation matrix

| Secret / integration | Class | Notes |
|----------------------|-------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` (prod) | **PRODUCTION-ONLY** | |
| `SUPABASE_SERVICE_ROLE_KEY` (staging) | **STAGING-ONLY** | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (prod/staging) | env-specific | Public but env-bound |
| `CRON_SECRET` (prod) | **PRODUCTION-ONLY** | |
| `CRON_SECRET` (staging) | **STAGING-ONLY** | Must differ |
| `TELEGRAM_BOT_TOKEN_STAGING` | **STAGING-ONLY** | |
| Production Telegram (if any) | **PRODUCTION-ONLY** | Must not exist on staging project |
| `RESEND_API_KEY` | **UNKNOWN** until founder decides | Prefer staging mailbox / no-send on staging |
| `UPSTASH_REDIS_*` | **UNKNOWN** | Prefer separate Upstash DB for staging |
| Affiliate tags (Amazon/ML) | **PRODUCTION-ONLY** preferred | Staging may use non-monetizing tags or unset |
| `ML_OAUTH_*` | **PRODUCTION-ONLY** | Do not put on staging unless needed |
| `AVENTA_*` target/ref/surface | **SHARED-SAFE** names | Values differ |

Any **UNKNOWN** → leave unset on staging until classified (fail-closed for optional features).

---

## 5. Git / branch strategy

| Branch | Exists today? | Intended Vercel project |
|--------|---------------|-------------------------|
| `master` (default) | **YES** | `aventa-new` Production |
| `staging` | **NO** | `aventa-staging` Production deploy |

**Founder (manual, later):**

```bash
git checkout master
git pull
git checkout -b staging
# push only when authorized: git push -u origin staging
```

Link `aventa-staging` → Git repo → Production Branch = `staging`.  
Do **not** auto-push from this preparation wave.

---

## 6. Cron architecture

```text
aventa-staging (Production deploy of staging project)
  Vercel Cron → GET /api/cron/distribution-drain
    → requireCronSecret (staging CRON_SECRET)
    → assertDistributionDrainAllowed
         surface=staging, target=staging, ref=oojshofr…, flag?
    → drain → Telegram staging only

aventa-new (aventaofertas.com)
  vercel.json crons → existing jobs ONLY
  distribution-drain NOT registered
  DISTRIBUTION_ENGINE_ENABLED=false
  surface ≠ staging → drain ABORT if ever hit
```

Staging cron example (not applied to Production):  
`docs/vercel/aventa-staging.vercel.json.example`

---

## 7. Domain strategy

| Option | Pros | Cons |
|--------|------|------|
| `staging.aventaofertas.com` | Clear isolation, stable CTA origin | Requires DNS (founder; **not** this wave) |
| `aventa-staging-*.vercel.app` | No DNS change | Ugly CTAs; URLs change if project renamed |

**This wave:** no DNS changes. Document preferred domain for later.

Set `NEXT_PUBLIC_APP_URL` on staging to the chosen origin so `/r/d` CTAs do not fall back to `aventaofertas.com`.

---

## 8. Vercel project checklist (founder)

1. Vercel → Add New Project → name `aventa-staging`  
2. Import same Git repo  
3. Production Branch = `staging` (after branch exists)  
4. Framework: Next.js; Build: `npm run build`; Install: `npm install`  
5. Set **Production** env vars for staging project (matrix above)  
6. Deployment Protection: recommend Vercel Authentication on staging  
7. Add cron from `docs/vercel/aventa-staging.vercel.json.example` **only in that project**  
8. Deploy staging project  
9. Verify `GET /api/health/distribution-env` (safe JSON)  
10. Keep `DISTRIBUTION_ENGINE_ENABLED=false` until soak authorization  

**CLI (document only — do not auto-run mutative):**

```bash
# After auth + branch push (founder):
vercel project add aventa-staging
# Link locally to staging project when working on staging:
# vercel link --project aventa-staging
# Set env via dashboard preferred (avoids shell secret leakage)
```

---

## 9. Health check

`GET /api/health/distribution-env`

Returns: `vercel_env`, `deployment_surface`, targets, refs, flag booleans, `drain_gate` reason.  
**Never** returns keys, tokens, `CRON_SECRET`, cookies.

---

## 10. Fail-closed summary

| Condition | Result |
|-----------|--------|
| Supabase URL = production ref | ABORT |
| `AVENTA_SUPABASE_TARGET` ≠ staging | ABORT |
| `AVENTA_EXPECTED_SUPABASE_REF` set ≠ staging | ABORT |
| `AVENTA_DEPLOYMENT_SURFACE` ≠ staging | ABORT |
| Flag ≠ true | NO-OP 200 |
| Missing/wrong `CRON_SECRET` | 401 |
| Staging destination `credential_ref` ≠ `TELEGRAM_BOT_TOKEN_STAGING` | blocked |

---

## 11. Explicit non-goals (this wave)

- No Production deploy  
- No Distribution ON  
- No money / Supply / WhatsApp  
- No DNS  
- No remote SQL  
- No auto Vercel project create  
- No commit / push  
