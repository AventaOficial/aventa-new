# Launch external configuration

These items cannot be completed inside the repository.

| Item | Class | What to do |
|------|--------|------------|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | RUNTIME CONFIGURATION | Required in production. Without them, votes, comments, reports, submissions, outbound clicks, account deletion, and OAuth callback fail closed (503). |
| `SYSTEM_ALERT_EMAIL_TO` + `RESEND_API_KEY` or `SYSTEM_ALERT_WEBHOOK_URL` | RUNTIME CONFIGURATION | Integrity cron already sends alerts when these exist. Confirm one destination receives a test failure. |
| Supabase PITR / backups | EXTERNAL INFRASTRUCTURE | Not visible in git. Confirm PITR in the Supabase dashboard and record the plan's RPO. No restore drill exists in this repo. |
| Apply `docs/supabase-migrations/20260923_launch_hardening.sql` | MANUAL VERIFICATION | Run on staging, then production. Until then, freshness falls back to the legacy selector and unknown/error statuses cannot be stored. |
| GitHub branch protection | EXTERNAL CONFIG REQUIRED | On `master`: require pull request, require status check `verify` from `.github/workflows/ci.yml`, disallow force push. This cannot be set from application code. |
| Supabase Auth rate limits | EXTERNAL INFRASTRUCTURE | Email signup/password reset are enforced by Supabase Auth, not by this app. OAuth callback is rate-limited here. |
| Vercel cron plan | RUNTIME CONFIGURATION | `offer-health-scan` is scheduled `15 */2 * * *`. Hobby cron granularity may differ; confirm the schedule in the Vercel project after deploy. |

## Code guarantees that do not depend on those settings

- Production money path freezes when `MONEY_PATH_FROZEN` is absent.
- Rewards turn on only with `REWARDS_PROGRAM_ACTIVE=true`. `COMMISSION_PROGRAM_ACTIVE` does not turn rewards on.
- Critical public mutations do not silently use in-memory rate limits in production.
