# P0-D3.2 — VERCEL CRON FORENSICS (READ-ONLY + SAFETY)

**Date:** 2026-09-17  
**Staging Supabase:** `oojshofrpbfwsiypcecr`  
**Production Supabase:** `mkgsrpsuvedwwlzmzmzh`  
**Production writes this phase:** **0**

---

## Executive verdict

| Question | Answer |
|----------|--------|
| Can we safely activate Vercel Cron for Distribution **staging** on the current project? | **NO** |
| Why? | Vercel Cron invokes **only Production deployments**. Single Vercel project `aventa-new` → `https://aventaofertas.com` (production). Adding `distribution-drain` to `vercel.json` would schedule against **Production**. |
| Action taken | **STOP** remote Vercel Cron activation. Harden handler fail-closed. Provide **local/in-process soak** for staging automation proof. |
| Workaround rejected | Do **not** point Production cron at staging DB. Do **not** enable Distribution on Production. Do **not** reuse prod `CRON_SECRET` / Telegram. |

Official Vercel docs: *“Vercel invokes cron jobs only for production deployments and not for preview deployments.”*  
https://vercel.com/docs/cron-jobs/quickstart

---

## 1. Vercel architecture (evidence)

| Item | Evidence |
|------|----------|
| Org | `aventa-oficial` |
| Projects | **1** — `aventa-new` |
| Latest Production URL | `https://aventaofertas.com` |
| Separate staging Vercel project | **ABSENT** |
| `vercel.json` crons | 8 jobs — **none** is `distribution-drain` |
| Preview = staging Supabase? | **Contract says yes IF Preview-scoped env vars are set** — `VERCEL_ENV=preview` alone does **not** switch DB (`STAGING_ENVIRONMENT_CONTRACT.md`) |
| Preview has `CRON_SECRET`? | **UNKNOWN** (dashboard not verified this wave); local `.env.local` has **no** `CRON_SECRET` |
| Does Vercel Cron run on Preview? | **NO** (platform limitation) |

### Environment mapping (contract)

| Vercel | `VERCEL_ENV` | Required Supabase |
|--------|--------------|-------------------|
| Production | `production` | `mkgsrpsuvedwwlzmzmzh` |
| Preview | `preview` | `oojshofrpbfwsiypcecr` (if Preview env provisioned) |
| Development | `development` / unset | staging |

---

## 2. Cron auth contract (`requireCronSecret`)

| Item | Behavior |
|------|----------|
| Headers | `Authorization: Bearer <CRON_SECRET>` **or** `x-cron-secret` |
| Query `?secret=` / `?token=` / `?cron_secret=` | **Always 401** |
| Missing `CRON_SECRET` env | **401 fail-closed** |
| Wrong secret | **401** (timing-safe sha256 compare) |
| Production vs Preview | Same code path; secret value comes from **that deployment’s env** |

---

## 3. Distribution drain target selection

Handler uses `createServerClient()` → `NEXT_PUBLIC_SUPABASE_URL` + service role of **the process**.

| Deploy | Typical URL | Drain risk |
|--------|-------------|------------|
| Production (`aventaofertas.com`) | prod Supabase | **Catastrophic if flag ON** — must abort |
| Preview | staging **iff** Preview env correct | OK for manual/external hit; **not** Vercel Cron |
| Local | staging (current `.env.local`) | OK for soak scripts |

**P0-D3.2 guard (`assertDistributionDrainAllowed`):**

1. Production Supabase ref → **503 abort**  
2. Target ≠ staging → **503 abort**  
3. Ref ≠ staging → **503 abort**  
4. `VERCEL_ENV=production` → **503 abort**  
5. Flag OFF → **200 skipped**  
6. Else drain  

→ Even if `distribution-drain` were mistakenly added to `vercel.json`, Production deploy **cannot** publish.

---

## 4. Limitation decision (FASE 3)

| Option | Supported safely now? | Decision |
|--------|----------------------|----------|
| A) Preview + external scheduler | Only if Preview URL stable + Preview env verified staging + distinct `CRON_SECRET` | **NOT READY** (Preview URLs ephemeral; env UNKNOWN) |
| B) Separate Vercel staging project | Best long-term; own `vercel.json` crons + staging env | **RECOMMENDED NEXT** (founder provision) |
| C) cron-job.org → staging URL | Possible later; must never hit `aventaofertas.com` | **DEFER** until stable staging URL |
| D) GitHub Actions → staging URL | Existing ML worker hardcodes **production** — unsafe pattern to copy | **REJECT for Distribution** until staging URL + secret isolation |
| E) Add path to current `vercel.json` | Would hit Production | **FORBIDDEN** |

---

## 5. Recommended architecture (do not implement this wave)

```text
NEW: Vercel project "aventa-staging"
  Production deploy of THAT project = staging app URL
  Env: staging Supabase + CRON_SECRET_STAGING + TELEGRAM_*_STAGING
       DISTRIBUTION_ENGINE_ENABLED=false (default)
  vercel.json crons include /api/cron/distribution-drain
  Vercel Cron hits staging project Production URL only
  assertDistributionDrainAllowed still refuses prod Supabase ref
```

Until then: **automated soak = in-process / local script** against staging Supabase (proven path from P0-D3).

---

## 6. What this wave does / does not

| Do | Do not |
|----|--------|
| Document limitation | Add `distribution-drain` to `vercel.json` |
| Harden drain abort guards | Enable Production Distribution |
| Staging soak script (in-process) | cron-job.org / GH Actions → prod |
| Keep flag OFF by default | Invent staging Vercel project |
| Tests for gate | Print / commit secrets |

---

## 7. Answers to the 10 forensic questions

1. **Unique Vercel project?** YES — `aventa-new` only.  
2. **Production env?** `VERCEL_ENV=production` → `aventaofertas.com` → prod Supabase (contract).  
3. **Preview?** Exists as Vercel Preview deployments; DB = staging **only if** Preview-scoped vars set.  
4. **Development?** Local / `development` → staging contract.  
5. **Functional Preview?** Deployments exist platform-side; staging DB wiring = **UNKNOWN** without dashboard verify.  
6. **Preview → staging Supabase?** Contract requires Preview env; not proven this wave.  
7. **`CRON_SECRET` on Preview?** UNKNOWN.  
8. **Vercel Cron on Production only?** **YES** (docs).  
9. **Cron specifically on Preview/Staging?** **NO** on current architecture.  
10. **Safe alternative?** Separate staging Vercel project **or** external scheduler to verified staging URL — **not** current Production cron.
