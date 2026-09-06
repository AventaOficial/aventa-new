# Telemetry Baseline — CONTROL

**Evidence:** E3  
**Regla:** solo eventos **existentes**. Nada añadido en HSE-01.

Separar:

- **EXISTING OBSERVATION DATA** = lo que el sistema puede persistir/emitir  
- **INFERRED BEHAVIOR** = interpretación humana (no E3 como dato)

---

## 1. First-party `offer_events`

Escritura vía `recordOfferEvent` / cola `write_jobs_queue` (`lib/server/writeQueue.ts`).

| event_type | Endpoint / camino | Auth |
|---|---|---|
| `view` | `POST /api/track-view`; también `POST /api/events` | Opcional Bearer |
| `outbound` | `POST /api/track-outbound` | Opcional Bearer |
| `share` | `POST /api/events` | Opcional |
| `cazar_cta` | `POST /api/events` desde OfferCard CTA | Opcional |

Validaciones: rate limit; `isOfferTrackable`; dedupe view/outbound (`offerEventDedupe`).

Payload conceptual: `offer_id`, `user_id|null`, `event_type`.

---

## 2. Rewards click attribution

`POST /api/track-outbound` también llama `recordOutboundClick` (DB rewards) y puede devolver `clickId` al cliente.  
Programa rewards puede estar inactivo por env — **estado runtime Production: no consultado en HSE-01**.

---

## 3. Client logger

`lib/monitoring/clientLogger.ts` → `POST /api/log-client-event`

Tipos: `view` | `vote` | `error` | `api_error`

Remote habilitado si `NEXT_PUBLIC_CLIENT_EVENTS_ENABLED=true` **o** alerta `feed_streak_5`.

Usos: feed loaded, vote success/fail, `notifyUserError` / `logClientError`.

---

## 4. Domain writes (no “analytics” terceros)

| Acción | Persistencia |
|---|---|
| Voto | `offer_votes` vía `/api/votes` |
| Favorito | `offer_favorites` cliente Supabase |
| Comentario | tablas comments vía API |
| Oferta nueva | `offers` vía `/api/offers` |
| Report | `/api/reports` |

Owner docs afirman ausencia de gtag/plausible/posthog en app (`infrastructureCatalog`) — tratado como E3 de catálogo repo.

---

## 5. EXISTING vs INFERRED

| EXISTING OBSERVATION DATA | INFERRED (no afirmar como medido) |
|---|---|
| Conteos event_type en DB (si se consulta después) | “Usuario abandonó porque…” |
| Votes/favorites rows | “Confianza alta” |
| Outbound events | “Conversión a compra” (no hay purchase event en este mapa) |

---

## 6. Time candidates (no segundos)

Para instrumentación futura (sin implementar ahora):

- network wait (fetch feed/detalle)  
- navigation (App Router)  
- user decision (gap entre eventos)  
- interaction (clicks)  
- loading (spinners)

**OBSERVED TIME = UNKNOWN** en HSE-01.
