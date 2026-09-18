# STAGING LEGACY PROJECT AUDIT — oojshofrpbfwsiypcecr

**Date:** 2026-09-17  
**Project-ref:** `oojshofrpbfwsiypcecr` (formerly “AventaOficial's Project”)  
**New role:** Official **STAGING** (not a third environment; legacy promoted)  
**Live DB probe this session:** **NOT PERFORMED** — no staging credentials in workspace (`.env.local` → production only; Supabase MCP unavailable).

**Rules followed:** no DROP, TRUNCATE, DELETE, migrations, or production writes.

---

## 1. Identity

| Field | Value |
|-------|--------|
| Created | 2026-07-13 (us-west-1) — `docs/LINEA_TIEMPO_AVENTA.md` |
| Historical role | Bubble-era / early Next prototype |
| Plaza tables | **Absent** (`plaza_* = null` per plaza-audit DATA_INVENTORY) |
| Must not be | Production; must not be deleted for Free-plan slot |

---

## 2. Historical data (from docs only — UNKNOWN live)

| Evidence | Finding | Confidence |
|----------|---------|------------|
| Timeline | First offer ~2025-07-13; first profile ~2025-07-18 | MEDIUM (doc) |
| Plaza audit | No `plaza_requests` / `plaza_discussions` on this project | HIGH (prior READ-ONLY SQL) |
| Schema parity with prod | **UNKNOWN** — staging likely **behind** prod migrations (2026 rewards/economy/distribution) | — |
| Backups | **UNKNOWN** — Supabase dashboard backup policy not readable from repo | — |
| Sensitive data | Possible early emails/profiles/offers if tables exist — treat as **PII-capable** until inventoried | — |
| RLS status | **UNKNOWN** without live `pg_policies` / advisors | — |

### Manual founder checklist (Supabase Dashboard → staging project)

1. Table editor: list all `public.*` tables + row counts.  
2. Auth → Users: count; note any real emails.  
3. Database → Roles / Advisors: RLS disabled tables.  
4. Backups: PITR / daily backup availability on Free.  
5. Decision: **KEEP rows** (default) vs export-then-archive later — **no wipe without written approval**.

---

## 3. Prototype vs keep

| Category | Guidance |
|----------|----------|
| Early offers/profiles | Preserve until inventoried; mark synthetic going forward |
| Empty / missing modern tables | Expected — apply migrations to **staging first** when unblocking D2 (not now) |
| Secrets in DB | Unlikely; still scan `app_config` / similar if present |

---

## 4. Security posture (provisional)

Until live audit:

- Assume **schema drift** vs production.  
- Assume some tables may lack RLS (legacy Bubble era).  
- Do **not** put production service role into staging tooling.  
- Staging write QA only after `.env` points at this ref + guards pass.

---

## 5. Decision required (manual)

| Decision | Options | Default |
|----------|---------|---------|
| Historical rows | Keep / export / wipe | **Keep** until inventoried |
| Auth users | Keep / disable / delete | **Keep**; use `@aventa-staging.test` for new QA |
| Schema catch-up | Apply prod migrations to staging in order | Deferred; **not** this task |

---

## 6. Relationship to Distribution D2

Staging ref is now **contractual**. D2 remote work still **BLOCKED** until:

- Local/Preview credentials verified against this ref  
- Schema readiness for `distribution_*` assessed on staging  
- No accidental prod apply
