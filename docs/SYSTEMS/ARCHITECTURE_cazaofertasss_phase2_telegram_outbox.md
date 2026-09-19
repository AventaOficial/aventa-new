# CAZAOFERTASSS — FASE 2 (TELEGRAM PUBLICATION OUTBOX)

Estado: **FASE 2 — outbox idempotente + adapter Bot API + canary fail-closed.**

Sin producción. Sin cron. Sin scraping. Sin money path de Aventa.

## Arquitectura

```
DealCandidate
  → evaluatePublicationEligibility / generateTelegramCard
  → preparePublication (saveIdempotent → PREPARED)
  → claimForSend (PREPARED → SENDING, lease atómico)
  → CazaTelegramBotPort.sendMessage
  → PUBLISHED | PREPARED(retry) | FAILED
```

Capas:

| Capa | Archivo | Autoridad |
|------|---------|-----------|
| Eligibility | `publication/eligibility.ts` | ¿se puede publicar? |
| Outbox | `publication/outbox.ts` | prepare / process / drain |
| Tracking | `tracking/publication.ts` | estados + identidad |
| Bot port | `telegram/botPort.ts` | contrato sendMessage |
| Bot adapter | `telegram/botAdapter.ts` | HTTP Bot API oficial |
| Canary | `telegram/canary.ts` | gate fail-closed |
| Card | `telegram/card.ts` | presentación (sin send) |
| Persistencia | `persistence/postgresPublicationRepository.ts` | claim/save/recover RPCs |

Ninguna lógica Telegram en scoring/evidence/identity/affiliate/candidate.

## Estados

| Estado | Significado | Terminal |
|--------|-------------|----------|
| `PREPARED` | En cola / retry pendiente | no |
| `SENDING` | Lease activo; un worker posee el envío | no |
| `PUBLISHED` | message_id confirmado | sí |
| `FAILED` | No recuperable (auth, unknown, max attempts) | sí |
| `RETRACTED` | Retirada manual | sí |

Campos outbox: `attempt_count`, `max_attempts`, `next_attempt_at`, `leased_until`,
`lease_owner`, `last_error_*`, `telegram_chat_id`, `affiliate_url`,
`published_revision`.

## Invariantes

1. `publicationIdentityKey = dealId|network|channel|trackingLabel` — única identidad lógica.
2. Dos drains concurrentes → un solo `sendMessage` (claim atómico).
3. Replay de `PUBLISHED` → `already_published`, cero envíos.
4. Candidato no elegible nunca entra a PREPARED.
5. El texto enviado **debe** contener `affiliateUrl` del dominio.
6. `CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled = false` siempre.
7. Canary exige `CAZAOFERTAS_TELEGRAM_CANARY=1` + allowlist + token env.
8. Timeout / missing message_id → `FAILED` (unknown outcome; no auto-retry).
9. Crash SENDING sin message_id + lease expirado → recover `PREPARED`.
10. Money path de Aventa intacto (`assertCazaOfertasMoneyUntouched`).

## Idempotencia

- Prepare: `saveIdempotent` / `ON CONFLICT DO NOTHING` sobre `publication_id`.
- Send: `caza_claim_publication` con `FOR UPDATE` (Postgres) o keyed mutex (in-memory).
- Persist outcome: `caza_save_claimed_publication` condicionado a `lease_owner`.

## Retry / recovery

| Error | Acción |
|-------|--------|
| 429 / 5xx | `PREPARED` + backoff (honra `retry_after`) |
| auth / bad request / chat unreachable | `FAILED` |
| timeout / missing message_id | `FAILED` unknown (evita duplicados) |
| lease SENDING expirado, sin error unknown | `PREPARED` (crash recovery) |
| `attempt_count >= max_attempts` | `FAILED` |

## Migración

`docs/supabase-migrations/20260919_cazaofertas_telegram_outbox.sql`

STAGING ONLY. No aplicar a producción.

## Canary

```
CAZAOFERTAS_TELEGRAM_CANARY=1
CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS=@canal_staging
CAZAOFERTAS_TELEGRAM_BOT_TOKEN=<token>
```

Producción permanece apagada por constante de frontera.

## Siguiente frontera

1. Aplicar migración outbox en staging y validar RPCs.
2. Canary real controlado (1 mensaje, canal allowlisted).
3. Persistencia de card text / snapshot para drain sin rehidratar candidato.
4. Observabilidad (contadores published/failed/retry) sin analytics de Aventa.
5. Cron acotado de drain (sólo después de canary estable).
