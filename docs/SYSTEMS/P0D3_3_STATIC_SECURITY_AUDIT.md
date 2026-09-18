# P0-D3.3 — STATIC SECURITY AUDIT (Distribution / Vercel staging prep)

**Date:** 2026-09-17  
**Scope:** static references only — no secret values printed

---

## References

| Pattern | Classification | Notes |
|---------|----------------|-------|
| `mkgsrpsuvedwwlzmzmzh` | **LEGIT** in docs/guards/tests | Production ref constant |
| `oojshofrpbfwsiypcecr` | **LEGIT** in docs/guards/tests/examples | Staging ref |
| `aventaofertas.com` | **LEGIT** prod default in emails/`siteUrl` fallback | Staging must set `NEXT_PUBLIC_APP_URL` |
| `TELEGRAM_BOT_TOKEN` / `_STAGING` | **LEGIT** env **names** only | Never commit values |
| `CRON_SECRET` | **LEGIT** env name | Values only in Vercel env |
| Hardcoded bot tokens / JWTs in app code | **NONE found** in Distribution path | |
| `vercel.json` + `distribution-drain` | **ABSENT** (correct for Production) | Staging example file only |
| GH Actions → `aventaofertas.com` | **RISK if copied** for Distribution | Do not reuse for staging drain |

---

## process.env usage (Distribution drain path)

| Source | Risk |
|--------|------|
| `requireCronSecret` → `CRON_SECRET` | Fail-closed; not logged |
| `assertDistributionDrainAllowed` → URL/target/surface/flag | Safe |
| Telegram `credential_ref` → env name lookup | Token never stored in DB |

---

## Verdict

No hardcoded Production secrets in tracked Distribution files.  
Staging isolation depends on **env values on `aventa-staging`**, not on `vercel.json` of Production.
