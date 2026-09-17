# AUDIT — Moderation OS + Offer Card (P0.3 pre-implementation)

**Date:** 2026-09-16  
**Mode:** Audit only — **no code changes in this phase**  
**Safety boundaries:** DI OFF · Supply WRITE unchanged · settlement/rewards/payouts OFF  

Related systems docs: [`SYSTEM_moderation.md`](./SYSTEM_moderation.md)

---

## A) Moderation OS (exists)

| Item | Finding |
|------|---------|
| Live UI | Focus Queue: `/admin/moderation`, `/equipo/moderacion` → `ModerationFocusWorkspace` |
| Legacy | `ModerationPendingPanel` still in repo, **not mounted** by pages |
| Claim | `POST /api/admin/moderation/claim-next` · cap 1000 · priority sort |
| Lock | 5 min lease · heartbeat · reclaim stale (admin) |
| Approve/Reject | `POST /api/admin/moderate-offer` |
| Edit | `PATCH /api/admin/update-offer` (canonical) |
| Snooze | `POST /api/admin/moderation-snooze` |
| Audit | `moderation_logs` + `moderation_outcomes` |
| Priority | P1–P4 from `bot_meta` / DQE / human → P2 · **not a new AI score** |
| Filters live | mainly `sourceTab` bot/users/all (+ legacy vital/needsFix unused in Focus) |

**Do not create a second moderation pipeline.** Extend Focus + existing APIs.

---

## B) Edit offer

| Item | Finding |
|------|---------|
| Backend | **Exists** — `update-offer` + `offerEditContract` |
| Form | `ModerationFixSheet` (Focus) — reusable |
| Editable | title, price, original_price, offer_url (+ affiliate_paste), description, coupons, image(s), category |
| **NOT editable via API** | `msi_months`, `bank_coupon`, store, fingerprint, bot_meta/DQE, votes |
| Discount | **DERIVED** from price/original — no SoT column |
| Demote | approved + material edit → pending |
| Mobile gap | Edit exists but UX not “price-first ABRIR→EDITAR→GUARDAR→SIGUIENTE” with sticky actions |

Field semantics: see offerEditContract + update-offer route.

---

## C) MSI / promotions

| Stage | MSI | bank_coupon | coupons text |
|-------|-----|-------------|--------------|
| Community upload | YES → DB | YES → DB | YES → DB |
| Bot ingest | **NOT written** | **NOT written** | **NOT written** |
| Claim-next select | **msi_months omitted** | included | included |
| Feed / transform | mapped to `msiMonths` | mapped | mapped |
| OfferCard | **prop unused — NOT rendered** | rendered | clipboard only |
| Modal / `/oferta/[id]` | rendered | rendered | rendered |

**Root cause MSI on card:** frontend drop in `OfferCard.tsx` (data arrives, not displayed).  
**Root cause MSI on many bot offers:** never persisted at ingest.  
**Do not invent MSI.** Show only when `msi_months` evidenced in DB.

---

## D) Test / demo offers

| Mechanism | Notes |
|-----------|-------|
| Tester mocks | `tester-*` IDs · `show_tester_offers` app_config — toggle in Operaciones |
| Soft delete `deleted_at` | Filtered in queries · **no app writer** |
| Expire | `POST /api/admin/expire-offer` → `expires_at=now` (reversible-ish vs hard delete) |
| Reject | status rejected |

Prefer expire/archive + config toggle; do not hard-delete real offers.

---

## E) Offer Card + CTA

| Item | Finding |
|------|---------|
| Card CTA label | **“Ver oferta”** → navigates to `/oferta/[id]` (+ `cazar_cta` event) — **not** merchant open |
| Merchant open CTA | **“Ver si sigue disponible”** on modal + detail → `track-outbound` → `click_id` → affiliate URL |
| Rename target | Merchant CTA → **“Cazar oferta”** must keep outbound chain intact |
| Dead space | Image column ~38%/fixed heights + `object-contain` + vertical sparse meta — structural, not just padding |
| MSI gap | See §C |

Outbound path SoT: `lib/rewards/clientOutbound.ts` → `/api/track-outbound` → `reward_outbound_clicks`.

---

## Implementation readiness (NOT started)

1. Mobile editor UX on existing FixSheet + update-offer (add MSI/bank if API extended carefully)  
2. Render MSI on OfferCard when `msiMonths` present  
3. Rename merchant CTA + verify tracking  
4. Test offer disable UX (expire + tester flag)  
5. Focus queue list/filters — evolve claim-next, don’t fork  

**DETENTE** until explicit implement go-ahead.
