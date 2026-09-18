# DISTRIBUTION ENGINE P0-D2 — STATUS

**Fecha:** 2026-09-17  
**Estado:** **BLOCKED — isolation not yet operationally verified**  
**Staging ref (contract):** `oojshofrpbfwsiypcecr`  
**Production ref (protected):** `mkgsrpsuvedwwlzmzmzh`

---

## Why D2 stays blocked

Staging is **formally identified** (legacy promoted). D2 still must not:

- apply `distribution_*` migration remotely  
- seed destinations  
- implement Telegram adapter / drain / hop  

until:

1. Local `.env.local` / `.env.staging.local` uses **staging** credentials (today often still production).  
2. Vercel **Preview** env vars point at staging (founder dashboard action — UNKNOWN until confirmed).  
3. Staging schema readiness assessed (legacy drift — see `STAGING_LEGACY_PROJECT_AUDIT.md`).

Guards abort staging scripts against production (verified: `verify-rewards-staging.mjs` → EXIT 2 on prod URL).

---

## Docs

- [`STAGING_ENVIRONMENT_CONTRACT.md`](./STAGING_ENVIRONMENT_CONTRACT.md)  
- [`STAGING_LEGACY_PROJECT_AUDIT.md`](./STAGING_LEGACY_PROJECT_AUDIT.md)  
- [`STAGING_FOUNDER_ENV_SWITCH.md`](./STAGING_FOUNDER_ENV_SWITCH.md)  

---

## Explicit non-goals until unblock

No Telegram, WhatsApp, drain, cron distribution, hop, seeds, production migration, money, Supply, attribution, moderation changes for Distribution.
