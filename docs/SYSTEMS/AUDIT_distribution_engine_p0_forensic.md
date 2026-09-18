# AUDIT — Distribution Engine P0 (Forensic Architecture)

**Fecha:** 2026-09-17  
**Modo:** Forensic audit only. **Sin código, migraciones, deploy, money, Supply, attribution rewrite.**  
**Objetivo de negocio:** Capa de distribución escalable (primer destino Telegram) donde ofertas **aprobadas** de Aventa se publican a comunidades/canales externos, preservando **una sola oferta** como SoT.

---

## A. Current architecture

### Lifecycle confirmado (repo)

```
ingest / community / bot
  → offers.status = pending
  → Focus claim (lock)
  → affiliate readiness + update-offer / affiliate_paste
  → POST /api/admin/moderate-offer
       CAS pending → approved
       expires_at, created_at (go-live), link_mod_ok
       moderation_logs + moderation_outcomes + notif + feed cache
  → HOME/FEED web (status ∈ {approved, published} ∧ not expired)
  → /oferta/[id] (status === approved ∧ not expired)
  → CTA → POST /api/track-outbound { offerId }
       → reward_outbound_clicks (click_id) + offer_events.outbound
  → buildOfferUrl(client) → retailer (Amazon: ascsubtag=av1.{offerId}.{clickId})
```

### Qué NO existe hoy

| Pieza | Estado |
|-------|--------|
| Cola de publish social / Telegram Bot API | **Ausente** |
| Tablas `distribution_*` / `deal_publications` (runtime) | Solo research en Supply docs; **no cableado** |
| `/out/[id]` hop externo | **Ausente** (propuesto en audit URL) |
| Writer productivo `status=published` | Lectura acepta `published`; approve escribe `approved` |
| Telegram share | Solo texto UX (`generateDealShareText`) + channel taxonomía |

### Eventos / estados reutilizables

| Artefacto | ¿Útil para Distribution? |
|-----------|---------------------------|
| `offers.status = 'approved'` | **Sí — gate canónico de elegibilidad** |
| `expires_at` / `isOfferTrackable` | Sí — no distribuir ni trackear expiradas |
| `publicationAllowed` (Deal Intelligence) | **No** — siempre `false`; ámbito DI `deal.detected`, no fila offers |
| `autoPublish` / `autoApprove` write | **OFF** — no reutilizar como interruptor de Distribution |
| `offer_events` | Engagement (view/outbound/share/cazar_cta) — **no** lifecycle approve |
| `moderation_outcomes` / `moderation_logs` | Auditoría humana — no fan-out |
| `write_jobs_queue` | Flush telemetría — patrón claim atómico reusable; **no** SoT de publicaciones |
| `reward_outbound_clicks.channel/campaign_key` | Sí — metadata de acquisition allowlisted |
| `ATTRIBUTION_CHANNELS` incluye `telegram` / `whatsapp` | Sí — taxonomía lista; cliente CTA **no** envía hints hoy |

### Canonical “distributable” event (CONFIRMED)

**Elegible para Distribution:**

```
offers.status = 'approved'
AND (expires_at IS NULL OR expires_at >= now())
```

Mismo criterio efectivo que feed + trackable.  
**Approve humano** (`moderate-offer` CAS) es el único writer productivo a `approved` en prod.

**No confundir:**

- `publicationAllowed: false` ≠ “oferta no distribuible”. Es boundary de **Deal Intelligence**.
- Visibilidad web (`approved`) ≠ publicación Telegram. Hoy approve solo enciende **feed Aventa**.

### Dónde enganchar Distribution (sin tocar Supply / semantics de moderación)

**Attach point:** capa **post-approve**, observando ofertas ya `approved`, **fuera** de:

- Supply WRITE / DQE / Verifier  
- `DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY`  
- settlement / rewards / ledger  

Opciones de disparo (evaluación más abajo):

1. Side-effect en `moderate-offer` tras CAS exitoso → enqueue distribution jobs  
2. Cron sweeper: `approved` − publications existentes  
3. Híbrido (recomendado)

---

## B. Target architecture

```
ONE offers row (SoT)
        │
        ▼  (status=approved ∧ live)
 Distribution Router (category → destinations)
        │
        ▼
 distribution_publications (1 por offer×destination×version)
        │
        ▼
 Destination Adapter (Telegram | future WhatsApp | Web)
        │
        ▼
 External message (chat_id + message_id)
        │
        ▼
 CTA → Aventa tracking entry (reuse click_id pipeline)
        │
        ▼
 retailer (affiliate URL from DB offer_url)
```

**Invariant SoT:** nunca clonar `offers` por canal. N publicaciones → mismo `offer_id`.

---

## C. Existing components reusable

| Componente | Path / símbolo | Uso Distribution |
|------------|----------------|------------------|
| Approve CAS | `app/api/admin/moderate-offer` | Trigger elegibilidad |
| Feed/track gates | `feedService`, `isOfferTrackable` | Misma ventana live |
| Affiliate resolve | `resolveAndNormalizeAffiliateOfferUrl`, `offer_url` / `original_offer_url` | Destino retailer SoT DB |
| Attribution | `recordAttributedClick`, `track-outbound`, channels taxonomía | Único path click_id |
| Share text seed | `lib/shareText.ts` `generateDealShareText` | Base renderer (extender) |
| Categories | `lib/categories.ts` (13 macros) | Routing categoría→destino |
| Cron auth | `requireCronSecret` | Worker drain |
| Write queue claim | `write_jobs_queue` patrón pending→processing | Modelo de retry |
| Idempotency patterns | clicks / moderation_outcomes / DI | UNIQUE keys |
| Attribution channel `telegram` | `lib/attribution/channels.ts` | Metadata allowlisted |

---

## D. Components requiring modification (futuro — no ahora)

| Componente | Cambio conceptual |
|------------|-------------------|
| `moderate-offer` (opcional) | Tras approve: enqueue fan-out (fire-and-forget / outbox). **No** cambiar gates afiliado ni money. |
| `clientOutbound` / Offer CTA | Pasar `channel` + `campaign` desde query/`utm_*` a `track-outbound` (hints ya soportados server-side). |
| (Opcional P0.5) Nuevo entry GET | Thin redirect que llame **el mismo** `recordAttributedClick` — no segundo ledger. |
| Ops UI | Visibilidad publications / failures (admin). |

---

## E. New components required (conceptual)

1. **Distribution domain** (lib + tables)  
2. **Telegram Bot adapter** (Bot API oficial)  
3. **Message renderer** determinístico  
4. **Router** category → destinations (config/DB)  
5. **Worker/cron** drain + retry  
6. **Tracking entry** para deep links externos (query hints y/o `/r/...`)  
7. **Admin/ops** list destinations + publication status  

---

## F. Domain model (conceptual — NO crear tablas aún)

### F.1 `distribution_brands` (opcional P0; útil multi-marca)

| Campo | Rol |
|-------|-----|
| `id` | UUID |
| `slug` | Identidad estable (`aventa-general`, `tech-mx`, …) |
| `display_name` | Marca pública del canal |
| `status` | `active` \| `disabled` |
| timestamps | `created_at`, `updated_at` |

### F.2 `distribution_destinations`

| Campo | Rol |
|-------|-----|
| `id` | UUID |
| `brand_id` | FK brand (nullable si brand diferido) |
| `provider` | `telegram` \| `whatsapp` \| `web` \| … |
| `slug` | `telegram-general`, `telegram-tecnologia` |
| `external_chat_id` | Telegram chat/channel id |
| `bot_credential_ref` | Nombre secret / vault key — **nunca** token en fila plaintext si se puede evitar |
| `status` | `active` \| `paused` \| `disabled` |
| `config` jsonb | parse_mode, silent, rate limits, template id |
| timestamps | |

**Identity:** `provider + external_chat_id` UNIQUE (o `slug` UNIQUE).

### F.3 `distribution_publications`

| Campo | Rol |
|-------|-----|
| `id` | UUID |
| `offer_id` | FK → `offers.id` (**mismo** offer) |
| `destination_id` | FK |
| `distribution_version` | int / string — bump si se republica con creative nueva |
| `idempotency_key` | UNIQUE — ver § Idempotency |
| `status` | `pending` \| `publishing` \| `published` \| `failed` \| `retryable` \| `cancelled` \| `disabled` |
| `attempt_count` | int |
| `next_attempt_at` | timestamptz |
| `last_error` | text / code |
| `external_message_id` | Telegram `message_id` |
| `external_chat_id` | snapshot |
| `rendered_payload` jsonb | snapshot del mensaje (audit; no inventar precios luego) |
| `tracking_campaign_key` | slug allowlisted para attribution |
| timestamps | `created_at`, `published_at`, `updated_at` |

### F.4 `distribution_events` (append-only audit)

| Campo | Rol |
|-------|-----|
| `id` | UUID |
| `publication_id` | FK |
| `event_type` | `enqueued` \| `attempt` \| `published` \| `failed` \| `retry_scheduled` \| `edited` \| `deleted` |
| `provider_response` jsonb | sanitizado |
| `created_at` | |

### ¿Pueden tablas existentes sostener esto?

| Necesidad | ¿Sin tablas nuevas? |
|-----------|---------------------|
| Estado publish por destino | **No** — `offers` es 1 fila; `offer_events` no modela message_id |
| Idempotencia offer×destino | **No** — requiere UNIQUE dedicado |
| Multi-brand routing | **No** confiable en solo env/code a escala |

**Conclusión:** tablas nuevas **conceptualmente requeridas**. `write_jobs_queue` puede transportar “procesar publication_id”, pero **SoT de publicación** debe ser `distribution_publications`.

Research previo (`deal_publications` en Supply research) es alineable; **no** acoplar a Supply WRITE.

---

## G. API endpoints required (futuro)

| Endpoint | Auth | Propósito |
|----------|------|-----------|
| `POST /api/cron/distribution-drain` | cron secret | Claim pending/retryable → adapters |
| `GET /api/r/d/[publicationId]` o `/api/out/d/...` | público rate-limited | Hop tracking → retailer (**mismo** `recordAttributedClick`) |
| Admin CRUD destinations | moderation/owner | Config |
| Admin list publications | moderation/owner | Ops |
| (Opcional) Telegram webhook | secret token verify | Delivery receipts / edits — **no** requerido P0 si solo send |

**No** endpoints públicos sin rate limit / auth donde aplique mutación.

---

## H. Worker / cron requirements

**Recomendación evidenciada: híbrido C + D**

| Pieza | Rol |
|-------|-----|
| Enqueue on approve (o outbox insert) | Baja latencia experimento |
| Cron `distribution-drain` (Vercel, p.ej. cada 1–5 min) | Drain + retries + sweeper missed |
| Claim atómico `pending/retryable → publishing` | Anti doble send serverless |

Escala millones: mover drain a worker largo / cola externa; **mismo modelo de publications**.  
P0 experimento (decenas–cientos/día): cron Vercel + `maxDuration` suficiente.

Patrón existente: `process-write-queue` + `requireCronSecret`.

---

## I. Telegram adapter design

### Oficial Bot API (requerido)

- **No** browser automation, scrapers, ni cuenta humana.  
- Bot identity: token en secret store (`TELEGRAM_BOT_TOKEN_*` por bot/brand).  
- Destination: `chat_id` de canal/grupo (bot admin con permiso post).  
- Send: `sendMessage` / `sendPhoto` → persistir `message_id`.  
- Edit/delete: `editMessageText` / `deleteMessage` si ops lo requiere (status aparte).  
- Rate limits: ~30 msg/s global bot; canales más estrictos — cola + backoff.  
- Idempotency: **antes** de llamar API, claim fila publication; si timeout tras éxito, UNIQUE evita re-send; reconciliar por `external_message_id` si existe.  
- Format: MarkdownV2 o HTML — **escapar** título/cupón; no HTML crudo de user.  
- Media: `image_url` solo si host allowlisted / HTTPS; else texto-only.  
- Links: CTA apunta a **Aventa tracking URL**, nunca retailer crudo en P0 (preserva click_id).

### Permissions

Bot añadido al canal como admin con “Post messages”. Channels vs groups: prefer channels para broadcast one-way.

---

## J. Tracking integration

### CRITICAL: un solo attribution path

Reuse:

- `recordAttributedClick`  
- `reward_outbound_clicks`  
- `track-outbound` contract (`conversionId`/`commissionId` null)  
- `channel` / `campaign_key` allowlisted  

### Flujo propuesto Telegram

```
Telegram message CTA
  → https://{aventa}/r/d/{publicationId}
       OR https://{aventa}/oferta/{id}?utm_source=telegram&utm_campaign={dest_slug}
  → server: recordAttributedClick({ channel:'telegram', campaign: dest_slug, … })
  → 302 Location: destination_url + Amazon ascsubtag(click_id)
  → retailer
```

| Enfoque | Pros | Contras |
|---------|------|---------|
| Solo `/oferta` + utm | Menos código; reusa página | Requiere que CTA cliente envíe hints (hoy **no**); fricción UX |
| Thin `/r/d/{publicationId}` | 1 tap; server SoT; mismos clicks | Nuevo entry point (mismo motor attribution) |

**Recomendación:** thin redirect **llamando el mismo** `recordAttributedClick` = no segundo sistema.  
Metadata distribution: `destination_id` / `publication_id` en `attribution_meta` (jsonb existente) o `campaign_key` = destination slug — **sin** columnas money.

**No** modificar settlement / ledger / rewards.

---

## K. Analytics integration

| Métrica | Clasificación | Fuente |
|---------|---------------|--------|
| Publications attempted/success/fail | **OBSERVED** | `distribution_publications` + events |
| Retry count / latency enqueue→published | **OBSERVED** | timestamps |
| Clicks from distribution | **OBSERVED** | `reward_outbound_clicks` where channel=telegram + campaign_key |
| CTR | **ESTIMATED** si views Telegram no fiables; **OBSERVED** si views=clicks-only denominator explícito |
| Telegram views | **UNKNOWN** hasta Bot API / analytics channel (no inventar) |
| Conversions / commissions | **UNKNOWN** esta fase — placeholders null |
| Category/channel performance | **OBSERVED** joins offer.category × destination × clicks |

Dual-write volumen opcional: `offer_events.share` o tipo futuro — **no** inventar event_type sin migración; P0 puede omitir.

---

## L. Idempotency strategy

**Key determinística recomendada:**

```
idempotency_key = `${offer_id}:${destination_id}:v${distribution_version}`
```

UNIQUE en `distribution_publications`.

| Amenaza | Mitigación |
|---------|------------|
| Doble approve side-effect | UNIQUE + ON CONFLICT DO NOTHING |
| Cron / serverless retry | Claim `publishing` atómico + lease timeout |
| Telegram OK pero response timeout | Si `external_message_id` set → published; else reconcile / manual |
| Republicación intencional | Bump `distribution_version` |

Alternativa más débil: solo `offer_id+destination_id` (bloquea edits creativos). Preferir version.

---

## M. Retry strategy

| Status | Significado |
|--------|-------------|
| `pending` | Encolado, nunca intentado |
| `publishing` | Claimed; lease |
| `published` | Terminal éxito |
| `retryable` | Fallo transitorio (429, 5xx, network) |
| `failed` | Terminal (chat not found, bot kicked, validation) |
| `cancelled` / `disabled` | Ops |

**Policy sugerida:** max 5–8 attempts; exponential backoff (1m → 5m → 15m → 1h → 6h); jitter; stop en 4xx permanentes Telegram.  
Ops: panel + alert webhook opcional (patrón `SYSTEM_ALERT_WEBHOOK_URL`).  
**No** infinite loops.

---

## N. Security model

| Riesgo | Control |
|--------|---------|
| Bot token | Env / Vercel secrets; rotación; no logs |
| Webhook (si existe) | `secret_token` / header verify |
| Admin destinations | `requireModeration` / owner |
| SSRF image fetch | No fetch arbitrario server-side sin allowlist; Telegram fetch de URL pública |
| Message injection | Escape MarkdownV2/HTML |
| Malicious offer content | Solo offers `approved` (ya moderadas) |
| Arbitrary outbound | Destination URL desde DB `offer_url`, no body Telegram |
| Rate abuse hop `/r/d` | `enforceRateLimit` + trackable check |
| Public mutate | Ningún POST público de publish |

---

## O. Migration strategy (cuando se implemente)

1. Migraciones aditivas `distribution_*` (RLS service_role / admin).  
2. Seed 1 brand + N Telegram destinations (General / Tech / Home / Coupons).  
3. Feature flag `DISTRIBUTION_ENABLED=false` default.  
4. Enqueue post-approve detrás de flag.  
5. Cron drain.  
6. Tracking hop + campaign wiring.  
7. Ops UI read-only → write.  

**Rollback:** flag OFF; cron no-op; publications quedan; no tocar offers/money.

---

## P. Test plan (futuro)

- Approve → N publications pending por routing.  
- Idempotencia: doble enqueue → 1 fila.  
- Adapter mock: success → `published` + message_id.  
- 429 → `retryable` + backoff.  
- Offer expired → no enqueue / drain skip.  
- pending/rejected → nunca publish.  
- `/r/d` → click row channel=telegram, campaign set; destination from DB.  
- Money: asertar settlement boundaries untouched.  
- Supply: asertar no WRITE Supply desde distribution.

---

## Q. Rollback plan

1. `DISTRIBUTION_ENABLED=0`  
2. Pause destinations (`status=paused`)  
3. Remover cron de `vercel.json` si necesario  
4. Revocar bot admin en canales  
5. Datos publications conservados para forensics  

---

## R. Operational monitoring

- Counts by status / destination / error code  
- Drain lag (`now - created_at` pending)  
- Telegram API error rates  
- Click rate by `campaign_key`  
- Alert on spike `failed`  

---

## S. Explicit non-goals (esta fase y P0 implement)

- Settlement / rewards / payouts / ledger writes  
- Supply WRITE / DQE / Verifier / autoApprove / autoPublish DI  
- Segundo attribution ledger  
- Segunda base de ofertas  
- Scraping / human Telegram / browser automation  
- Inventar views / conversions / commissions  
- WhatsApp implementation  
- Activar money path  

---

## 1. System trace — summary

**Estado distributable:** `approved` + live.  
**publicationAllowed:** DI-only, siempre false — **no** usar como gate Distribution.  
**Publish queue social:** no existe.  
**Attach:** post-approve fan-out + cron drain; cero cambios Supply/moderation semantics.

---

## 2–3. Domain + SoT

ONE `offers` × MANY `distribution_publications`.  
Invariant: `publication.offer_id` siempre apunta a la misma fila canónica.

---

## 4. Telegram architecture

Bot API oficial; token secret; `chat_id` + `message_id`; rate limit + idempotent claim; escape; CTA → Aventa tracking.

---

## 5. Offer → Telegram message (renderer)

Derivar **solo** de campos confiables; omitir unknown.

| Campo | ¿Mostrar? | Fuente |
|-------|-----------|--------|
| title | Sí si non-empty | `offers.title` |
| image | Sí si HTTPS usable | `image_url` / first `image_urls` |
| price | Sí si number válido | `price` |
| original price / discount % | Solo si `original_price > price > 0` | calcular; si no, omitir “-35%” |
| merchant/store | Sí si known | `store` |
| coupon | Solo si `coupons` non-empty | no inventar |
| MSI | Solo si `msi_months` number | no inventar |
| bank coupon | Solo si `bank_coupon` | opcional línea |
| CTA URL | Tracking Aventa | publication id / offer path |
| Affiliate URL | **No** en mensaje P0 | solo tras hop server |

Seed existente: `generateDealShareText` — extender con store/discount **condicionales**.

---

## 6–7. Tracking + Analytics

Ver §§ J–K. OBSERVED vs ESTIMATED vs UNKNOWN estricto.

---

## 8–9. Idempotency + Retry

Ver §§ L–M.

---

## 10. Scheduling recommendation

**Hybrid enqueue-on-approve + cron drain** — encaja Vercel/Supabase, `write_jobs_queue` patterns, escala experimento ahora y modelo publications a millones después.

| Modelo | Verdict |
|--------|---------|
| A immediate sync in request | Riesgo timeout/Telegram fail en approve path |
| B batch only | Latencia alta |
| C queue+worker | Ideal; en Vercel ≈ cron drain |
| D cron poll only | Simple; OK P0; peor lag |
| E hybrid | **Recommended** |

---

## 11. Channel routing

**DB/config-driven** (no hardcode largo plazo).

Ejemplo conceptual:

| `offers.category` | Destinos |
|--------------------|----------|
| `tecnologia`, `gaming` | General + Technology |
| `hogar`, `jardin` | General + Home |
| cupón-like (`coupons` present / categoría servicios?) | General + Coupons |
| default | General |

Routing table: `distribution_route_rules (category_id, destination_id, priority)`.  
**No** duplicar offers.

---

## 12. Moderation safety

```
pending ≠ approved ≠ distributed
```

Distribution **solo** consume server-authoritative `approved` (+ live).  
No client publish. No autoApprove/autoPublish activation en esta auditoría.

---

## 13. Economy compatibility

Distribution clicks = **observations** en `reward_outbound_clicks` (channel/campaign).  
Futuro: matcher/ledger puede filtrar por channel **sin** que Distribution escriba money.  
Phase boundary: `conversionId`/`commissionId` null; settlement OFF.

---

## 14. Multi-brand

`Brand → Destination → Publication`; N brands × N destinations; mismo `offer_id`.

---

## 15. WhatsApp future

`provider` + adapter interface:

```
publish(publication, offer, destination): AdapterResult
```

Telegram-specific (parse_mode, chat_id) **solo** en adapter. Core: status machine + idempotency + routing.

---

## 16. Scale analysis

| Volume | Bottleneck | Architecture OK? |
|--------|------------|------------------|
| 10–100/day | Ninguno | Cron + sync send OK |
| 1k/day | Telegram rate; DB writes ~few k | Queue + backoff |
| 10k/day | Cron duration; concurrent claim | Shard by destination; longer worker |
| 100k/day | API limits; analytics volume | External queue; batch; partition events |

No overengineer P0; **no** elegir sync-in-approve-only (colapsa antes).

---

## 17. Security

Ver § N.

---

## 18. Exact implementation sequence (cuando se autorice)

1. Docs + feature flag  
2. Migraciones `distribution_*`  
3. Seed brands/destinations/routes  
4. Renderer + Telegram adapter (dry-run / staging bot)  
5. Enqueue post-approve (flagged)  
6. Cron drain + retries  
7. Tracking hop `/r/d` + campaign  
8. Wire CTA query hints if using `/oferta` path  
9. Ops read UI  
10. Enable 1 destination → expand  

---

## DETENTE

Audit only. Sin implementación.
