# STAGING CRON FORENSIC

**Date:** 2026-09-17  
**Staging ref:** `oojshofrpbfwsiypcecr`  
**Production ref (READ-ONLY):** `mkgsrpsuvedwwlzmzmzh`  
**Scope:** forensic only — **NO** new cron, **NO** distribution drain, **NO** production writes.

---

## Executive answers

| Question | Answer |
|----------|--------|
| **A) Scheduler in production** | **Primary: Vercel Cron** (`vercel.json`). Secondary: **pg_cron** (1 maintenance job). External: cron-job.org (bot-ingest) + GitHub Actions ML worker → **production URL**. |
| **B) Jobs Distribution needs** | Future `POST/GET /api/cron/distribution-drain` (documented, **not implemented**). Pattern: enqueue-on-approve + cron drain + retries. |
| **C) Can staging run those jobs?** | **Not yet** — no drain route; no distribution tables; no staging Vercel cron proven. Queue/auth patterns **are** reusable. |
| **D) Staging cron configured?** | **pg_cron YES** (legacy jobs). **Vercel Cron for staging: UNKNOWN** (no evidence of staging deployment crons in-repo). Local: no `CRON_SECRET`. |
| **E) Staging cron → production risk?** | **GitHub Action hardcodes `https://aventaofertas.com/...`** (production). Staging DB pg_cron only touches **local** staging DB. App crons use env Supabase URL — safe **if** staging deploy has staging env only. |
| **F) Auth** | `requireCronSecret` — Bearer `CRON_SECRET` or `x-cron-secret`; query secrets **rejected**; missing secret → **fail-closed 401**. |
| **G) Frequency** | See tables below (daily Vercel jobs; bot external ~15m; GH Actions ~:07/:37). |
| **H) Timeout** | Bot/supply routes `maxDuration=300`; most digest/queue routes **no** explicit maxDuration (Vercel plan default). |
| **I) Retry** | `write_jobs_queue`: max **5** attempts, stale processing reclaim 15m. Distribution drain retries: **designed** (`retryable` status) — **not implemented**. |

---

## Architecture map

```text
PRODUCTION APP SCHEDULING
├── Vercel Cron (vercel.json) ──Bearer CRON_SECRET──► /api/cron/*
│     daily-digest, weekly-digest, system-integrity,
│     offer-health-scan, ml-oauth-refresh,
│     process-write-queue, rewards-release-holds, supply-engine
├── External cron-job.org ──► /api/cron/bot-ingest   (NOT in vercel.json)
├── GitHub Actions ML worker ──► aventaofertas.com/api/cron/bot-ingest-candidates
└── Supabase pg_cron ──► maintenance.process_offers_lifecycle()  (daily 03:00)

STAGING DB (oojshofrpbf…)
└── pg_cron ──► aventa_mark_expired */5; ui_events cleanup; cron detail purge
    (NO distribution; NO Vercel-linked evidence in this forensic)

DISTRIBUTION (future — OFF)
└── enqueue on approve → distribution_publications
    + cron distribution-drain → adapters (Telegram/WA)  ← NOT BUILT
```

---

## Component inventory

### Vercel Cron (`vercel.json`)

| Path | Schedule (UTC) | Classification | Notes |
|------|----------------|----------------|-------|
| `/api/cron/daily-digest` | `0 1 * * *` | **VERIFIED** (code + vercel.json) | Auth: cron secret |
| `/api/cron/system-integrity` | `30 2 * * *` | **VERIFIED** | |
| `/api/cron/offer-health-scan` | `0 3 * * *` | **VERIFIED** | |
| `/api/cron/weekly-digest` | `0 0 * * 1` | **VERIFIED** | Mondays |
| `/api/cron/ml-oauth-refresh` | `0 4 * * *` | **VERIFIED** | |
| `/api/cron/process-write-queue` | `45 3 * * *` | **VERIFIED** | Drains `write_jobs_queue` → `offer_events` |
| `/api/cron/rewards-release-holds` | `0 5 * * *` | **VERIFIED** | Money-adjacent — **do not run on staging casually** |
| `/api/cron/supply-engine` | `20 14 * * *` | **VERIFIED** | Supply — out of Distribution scope |

**Not in vercel.json (exists as routes):**

| Path | Classification | Notes |
|------|----------------|-------|
| `/api/cron/bot-ingest` | **VERIFIED** code / **MISSING** from vercel.json | Hobby 1×/day limit; external scheduler |
| `/api/cron/bot-ingest-candidates` | **VERIFIED** | GH Actions / Railway worker |
| `/api/cron/sticky-sku-seeds` | **VERIFIED** code | Supply-related |
| `/api/cron/distribution-drain` | **MISSING** | Spec only (`AUDIT_distribution_engine_p0_forensic.md`) |

### Auth (`lib/server/cronAuth.ts`)

| Item | Classification |
|------|----------------|
| Header-only secrets | **VERIFIED** |
| Fail-closed without `CRON_SECRET` | **VERIFIED** |
| Timing-safe compare (sha256) | **VERIFIED** |
| Query `?secret=` rejected | **VERIFIED** |
| Staging deploy has distinct `CRON_SECRET` | **UNKNOWN** (not verified on Vercel UI this wave) |
| Local `.env.local` has `CRON_SECRET` | **MISSING** |

### Supabase / pg_cron

| Env | Jobs | Classification |
|-----|------|----------------|
| **Staging** | `aventa_mark_expired` `*/5`; ui_events 90d delete; cron.job_run_details purge; realtime.messages purge | **VERIFIED** (live SQL) — legacy maintenance, not Distribution |
| **Production** | `maintenance.process_offers_lifecycle()` `0 3 * * *` | **VERIFIED** (READ-ONLY) |
| pg_cron used for Distribution | — | **MISSING** (not planned; Vercel preferred) |

### GitHub Actions

| Item | Classification | Risk |
|------|----------------|------|
| `.github/workflows/mercadolibre-worker.yml` | **VERIFIED** | `AVENTA_INGEST_ENDPOINT` **hardcoded to production** `aventaofertas.com` |
| Accidental staging→prod publish via this workflow | **UNSAFE** if re-aimed without guards | Today targets prod intentionally; Distribution must **never** reuse this without staging URL + secret isolation |

### `write_jobs_queue`

| Item | Classification |
|------|----------------|
| Exists on staging (W1) | **VERIFIED** |
| RLS + service_role grants (W1.5) | **VERIFIED** |
| Cron drain `process-write-queue` | **VERIFIED** (code); staging schedule **UNKNOWN** without staging Vercel |
| Used by Distribution | **No** — telemetry events only; Distribution uses own publications table |
| Retries | **VERIFIED** (5 attempts) |

---

## Distribution scheduling requirements (future)

| Requirement | Status |
|-------------|--------|
| `distribution-drain` route | **MISSING** |
| Register in vercel.json / external cron | **MISSING** |
| Claim atomic pending→publishing | Spec **VERIFIED** in docs; code **MISSING** |
| Idempotency UNIQUE(offer, destination, version) | SQL foundation file exists; **not applied** on staging |
| Staging-only destination seeds | **MISSING** (must not use prod chat_ids) |
| Guard: refuse if `AVENTA_EXPECTED_SUPABASE_REF` ≠ staging on staging deploy | Pattern exists for Supabase; cron route guard **UNKNOWN/MISSING** for distribution |

---

## Safety rules (do not violate)

1. **Do not** enable Distribution cron that can post to real Telegram/WhatsApp from staging without stub adapters.  
2. **Do not** point staging secrets at production Supabase.  
3. **Do not** run `rewards-release-holds` / supply crons against wrong project.  
4. **Do not** create pg_cron Distribution jobs on production from this wave.

---

## Verdict for Distribution pre-gate

| Area | Status |
|------|--------|
| Production cron architecture understood | **VERIFIED** |
| Staging Vercel cron parity | **UNKNOWN** / effectively **MISSING** |
| Distribution drain | **MISSING** |
| Cron auth pattern reusable | **VERIFIED** |
| Accidental prod outbound via GH Actions URL | **UNSAFE** if mis-copied for Distribution |
