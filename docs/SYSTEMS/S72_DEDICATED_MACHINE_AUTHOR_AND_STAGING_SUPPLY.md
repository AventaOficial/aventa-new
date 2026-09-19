# S7.2 — Dedicated Machine Author + Controlled Staging Supply

## Status

**EXECUTED — controlled staging supply window PASS.**

Dedicated machine author:
`778cfbf5-294e-4866-883f-71e3046566cb` (`machine-supply-staging@aventa.internal`, role=`user`).

Window: `--execute --cap=5` → **5/5 pending inserts**, Distribution Δ=0, writes flag OFF after.

Evidence: `scripts/_s72_reports/s72-supply-latest.json`

See also: `docs/SYSTEMS/S721_AUTH_STAGING_REPAIR.md`

---

## 1. Machine author architecture

Canonical Aventa model (no new tables):

| Concept | Authority |
|---|---|
| Human author | `auth.users` + `profiles` row; `offers.created_by` |
| Machine author | **same**: a dedicated Auth UUID referenced by `BOT_INGEST_USER_ID` |
| Dual TECH/STAPLES | optional `BOT_INGEST_USER_ID_TECH` + `_STAPLES` + category routing (`resolveBotAuthorUserId`) |
| Roles | `profiles.role` ∈ user/moderator/admin (legacy); machine should be `user`, not admin |

There is **no** separate `is_bot` table required for ingest. Docs (`CONTEXTO_SISTEMA_AVENTA.md`) state the bot is a fixed Auth UUID.

S7.1 used seed admin `6aa733d4-…` only as a temporary canary author. **S7.2 forbids that UUID** via `assertDedicatedMachineAuthor`.

---

## 2. Staging configuration (intended)

Once dedicated author exists:

```
BOT_INGEST_ENABLED=1                    # process-scoped in S7.2 script; optional staging Vercel later
BOT_INGEST_USER_ID=<dedicated UUID>     # NOT 6aa733d4-…
BOT_INGEST_MACHINE_PENDING_WRITES       # OFF by default; ON only inside withMachinePendingWritesEnabled
DISTRIBUTION_ENGINE_ENABLED=0
Rewards / Economy / Attribution / Telegram = OFF
```

GHA `WORKER_DISCOVERY_ONLY` remains default `1` (not mutated in this campaign). Continuous production writes remain OFF.

---

## 3. Cap enforcement

| Constant | Value |
|---|---|
| `S72_STAGING_WINDOW_HARD_CAP` | **5** |
| Server clamp | `resolveStagingSupplyWindowCap` → `resolveCanaryInsertCap` |
| Payload | `processExternalWorkerBatch({ canaryCap })` |

Cap is **server-side** on insert budget, not a client promise.

---

## 4. Execution (attempted)

| Step | Result |
|---|---|
| Staging ref match | OK (`oojshofrpbfwsiypcecr`) |
| Distribution OFF | OK |
| Writes flag OFF | OK |
| `s72-provision-machine-author.ts` | **FAIL** — Auth createUser DB error |
| invite / generateLink | **FAIL** — same class of error |
| `listUsers` | OK — **1** user (seed only) |
| Controlled `--execute` window | **NOT RUN** (author precheck STOP) |

Evidence: `scripts/_s72_reports/s72-auth-diag.json`, provision STOP output.

---

## 5. Funnel

Not produced for a live dedicated-author window (blocked).

Reconcile path of `s72-controlled-staging-supply.ts` is ready once author exists.

---

## 6. Focus handoff

Not executed (no new pending under dedicated author).

---

## 7. Idempotency

Not executed (no live insert under dedicated author).

---

## 8. Distribution firewall

No S7.2 write window → campaign Distribution Δ **not applicable** (no inserts attempted). Precondition: `DISTRIBUTION_ENGINE_ENABLED` unset/OFF verified before STOP.

---

## 9. Final flags

| Flag | State |
|---|---|
| `BOT_INGEST_MACHINE_PENDING_WRITES` | OFF |
| `DISTRIBUTION_ENGINE_ENABLED` | OFF |
| Dedicated `BOT_INGEST_USER_ID` | **not provisioned** |
| Seed admin reused permanently | **no** |

---

## 10. Remaining blockers

1. **CRITICAL — Staging Auth user creation broken**  
   External action in Supabase Dashboard / Postgres on project `oojshofrpbfwsiypcecr`:
   - Inspect Auth + Postgres logs for `handle_new_user` / `profiles` insert failures
   - Repair trigger so `auth.admin.createUser` succeeds
   - Create dedicated machine user (email e.g. `machine-supply-staging@aventa.internal`) with `profiles.role=user`
   - Re-run `npx tsx scripts/s72-provision-machine-author.ts`
   - Then `npx tsx scripts/s72-controlled-staging-supply.ts --execute --cap=5`

2. Optional staging Vercel env for `BOT_INGEST_ENABLED` + dedicated author (writes still via canary helper only).

3. GHA still targets production ingest URL — do not point continuous worker at staging until author + caps are verified.

---

## 11. Exact production-readiness gaps

| Gap | Status |
|---|---|
| Dedicated machine author in staging | **BLOCKED** |
| Controlled staging window ≤5 pending | Code ready; not executed |
| Continuous GHA → staging writes | Not started (correct) |
| Production machine writes | Must remain OFF |
| Distribution / Rewards / Economy / Attribution | Must remain OFF |

---

## Artifacts

- `lib/bots/ingest/stagingSupplyWindow.ts`
- `scripts/s72-provision-machine-author.ts`
- `scripts/s72-controlled-staging-supply.ts`
- `tests/bots/ingest/stagingSupplyWindow.s72.test.ts`
- `scripts/_s72_reports/s72-auth-diag.json`
