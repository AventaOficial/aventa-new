# AVENTA — Incident response

One page. Use it under pressure. Money and machine mint stay off unless a separate checklist says otherwise.

## 1. Site outage

1. Detect: `/api/health/live` is 200 and `/api/health/ready` is not, or users cannot load `/`.
2. Contain: do not flip money or machine-write flags.
3. Diagnose: Vercel deployment, Supabase status, `GET /api/health`.
4. Mitigate: Vercel instant rollback to the last good deployment.
5. Recover: confirm `/` and `/api/health` return offers.
6. Verify: one offer page, one search, one outbound click in a non-production browser.
7. Postmortem: time, cause, rollback id.

## 2. Bad deployment

1. Detect: CI passed but production behavior is wrong.
2. Contain: rollback in Vercel. Do not hotfix on production env vars first.
3. Diagnose: diff the deployment against `master`.
4. Mitigate: rollback, then fix on a branch.
5. Recover: redeploy only after `npm run test:launch` and `npm run ci:verify`.
6. Verify: smoke the broken path.
7. Postmortem: which check missed it.

## 3. Stale offers

1. Detect: `freshness.overdue` in system integrity, or users report dead prices.
2. Contain: do not hide the whole feed. Expired and `out_of_stock` already lose the active CTA.
3. Diagnose: `offer_freshness_scan_state`, cron `/api/cron/offer-health-scan`, retailer timeouts.
4. Mitigate: cron is every 2 hours with a capped batch. A backlog drains across runs via `next_check_at`. Do not raise the batch above 50.
5. Recover: hot offers (`price_changed`, recent clicks) are scheduled sooner.
6. Verify: offer page shows "El precio cambió" or "Oferta no disponible" instead of a normal Cazar button.
7. Postmortem: which retailer failed.

## 4. Bad supply

1. Detect: moderation queue `pending` spikes, or supply runs stop.
2. Contain: machine mint is production-blocked. Do not enable `BOT_INGEST_MACHINE_PENDING_WRITES` in production.
3. Diagnose: admin hunter / supply runs. This runbook does not change S6.1, S7, or S9.
4. Mitigate: reject pending rows in moderation. Leave machine writes off.
5. Recover: queue depth under the integrity threshold.
6. Verify: new public offers are human-approved.
7. Postmortem: source of the bad rows.

## 5. Abuse spike

1. Detect: 429/503 on votes, comments, reports, submissions.
2. Contain: critical routes fail closed in production when Upstash is missing or timing out.
3. Diagnose: Upstash dashboard and `rate_limit_backend_denied` on `/api/admin/launch-signals`.
4. Mitigate: confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Ban accounts in admin.
5. Recover: legitimate votes succeed again.
6. Verify: a second account can vote; a flood receives 429.
7. Postmortem: which preset was hot.

## 6. Database issue

1. Detect: `/api/health` error, integrity cron 500.
2. Contain: stop deploys. Do not run ad-hoc deletes.
3. Diagnose: Supabase status and the failing check name.
4. Mitigate: if data loss is suspected, restore from PITR. PITR is EXTERNAL — confirm in the Supabase dashboard. There is no restore drill in this repo.
5. Recover: health ok, feed loads.
6. Verify: a known offer id still resolves.
7. Postmortem: RPO actually achieved.

## 7. Attribution anomaly

1. Detect: outbound clicks drop to zero while page views continue, or the reverse.
2. Contain: do not turn on rewards, commissions, or settlement to "fix" tracking.
3. Diagnose: `POST /api/track-outbound` status, `offer_events` vs `reward_outbound_clicks`.
4. Mitigate: if the route is 503, Upstash is down and the critical limiter is fail-closed. Restore Upstash.
5. Recover: a click returns 200 and a click id.
6. Verify: funnel snapshot outbound count moves.
7. Postmortem: tracking vs money. Money stays off.

## 8. Accidental flag activation

1. Detect: rewards UI, payout cron activity, or machine rows in `offers` with status pending from a bot author.
2. Contain immediately:
   - `REWARDS_PROGRAM_ACTIVE` absent or false
   - `COMMISSION_PROGRAM_ACTIVE` absent or false
   - `MONEY_PATH_FROZEN` absent or true in production (absent already freezes)
   - `SETTLEMENT_BRIDGE_ENABLED` absent or false
   - machine pending writes off
3. Diagnose: Vercel env diff. `COMMISSION_PROGRAM_ACTIVE` does not turn rewards on.
4. Mitigate: revert the env var. Redeploy so functions pick it up.
5. Recover: `isRewardsProgramActive()` false, freeze true.
6. Verify: a user cannot request a payout.
7. Postmortem: who changed the var. No code change in S6.1/S7/S9/writer from this runbook.
