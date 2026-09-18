# RESEARCH — AVENTA SUPPLY INTELLIGENCE ENGINE

**Fecha:** 2026-09-16  
**Tipo:** Investigación científica + arquitectura objetivo  
**Regla:** Toda afirmación etiqueta evidencia. Settlement / money path **OFF** durante esta investigación.  
**Precedencia Aventa:** código + `docs/AVENTA_SOURCE_OF_TRUTH.md` > docs históricas.

**Leyenda de evidencia**

| Etiqueta | Significado |
|----------|-------------|
| **CONFIRMADO** | Fuente primaria / código / documentación oficial |
| **PROBABLE** | Inferencia fuerte con soporte parcial |
| **HIPÓTESIS** | Plausible pero no demostrada |
| **DESCONOCIDO** | Sin evidencia suficiente |

---

## 0. Método y preguntas de investigación

### Preguntas fundamentales

1. ¿Cómo descubren las comunidades grandes las ofertas?
2. ¿Qué fuentes son legítimas, automatizables y escalables?
3. ¿Qué parte está automatizada vs humana?
4. ¿Cómo se decide si un precio es “realmente bueno”?
5. ¿Cómo se modela el precio efectivo con cupones/bancos/cashback?
6. ¿Qué se puede verificar sin violar ToS?
7. ¿Qué ya tiene Aventa y qué falta para miles de ofertas/día?
8. ¿Es posible publicar casi en tiempo real con falsos positivos controlados?

### Método

1. Formular hipótesis.  
2. Buscar fuentes primarias (docs oficiales, FAQ de plataformas, código Aventa).  
3. Etiquetar evidencia.  
4. Diseñar arquitectura compatible con stack actual.  
5. Definir experimentos falsables.  
6. No inventar APIs, precios ni estadísticas no medidas.

---

## 1. Mapa del ecosistema (evidencia)

### 1.1 Pepper / Promodescuentos / red Pepper

| Dimensión | Hallazgo | Evidencia |
|-----------|----------|-----------|
| Origen de ofertas | **CONFIRMADO:** mayoría por usuarios miembros | FAQ Promodescuentos: “La inmensa mayoría… compartidas por usuarios” |
| Moderación | **CONFIRMADO:** equipo de soporte/moderación revisa deals; merchants nuevos se chequean | FAQ Pepper (pepperdeals.com/page/help) |
| Ranking | **CONFIRMADO:** votos hot/cold (“temperatura”) | FAQ Pepper + app Promodescuentos |
| Monetización | **CONFIRMADO (PD):** ingresos por enlaces afiliados; no cobran al usuario | Discusión oficial PD + FAQ |
| Auto-discovery masivo | **DESCONOCIDO** a nivel interno; **PROBABLE:** humano-first + tooling editorial | No hay whitepaper público del pipeline |
| Detección de cupones | **PROBABLE:** mix comunidad + editors | App menciona cupones Amazon/ML/Walmart; no API pública |

### 1.2 Chollometro / Ofertitas / grupos TG/WA/Discord/FB/X

| Plataforma | Modelo aparente | Evidencia |
|------------|-----------------|-----------|
| Chollometro | Comunidad tipo Pepper (España) | **PROBABLE** (misma familia de producto; no auditado código) |
| Ofertitas / canales TG | Curación humana + bots de reenvío | **HIPÓTESIS** operativa común en LatAm; sin auditoría interna |
| WhatsApp grupos | Broadcast humano / copy-paste | **PROBABLE** |
| Discord | Bots + canales por categoría | **PROBABLE** |
| Facebook / X | UGC + páginas de curación | **PROBABLE** |
| Price trackers (Keepa, CamelCamelCamel) | Histórico de Amazon | **CONFIRMADO** Keepa API docs |
| Cashback / cupones | Agregadores de códigos + partners | **PROBABLE**; APIs varían por proveedor |

**Conclusión ecosistema (CONFIRMADO + PROBABLE):** las grandes comunidades de chollos **no** se presentan como scrapers omniscientes. Su moat público es **comunidad + votos + moderación + afiliados**. La automatización de supply es un diferenciador potencial para Aventa, no el modelo confirmado de Pepper.

---

## 2. Pipeline operativo reconstruido (hipótesis arquitectónica)

```text
SOURCE → DISCOVERY → INGESTION → NORMALIZATION → PRODUCT MATCHING
→ PRICE CHECK → HISTORICAL PRICE → COUPON DISCOVERY → PROMOTION DISCOVERY
→ DEAL SCORING → FRAUD/FP FILTER → MODERATION → PUBLISH → DISTRIBUTION
→ CLICK → AFFILIATE → FEEDBACK → LEARNING
```

Este pipeline es el **modelo objetivo** de Aventa. Para Pepper/PD: etapas de discovery automático profundo = **DESCONOCIDO**; etapas de UGC + votos + mods = **CONFIRMADO**.

### Por etapa (síntesis)

| Etapa | Qué hace | Datos | Auto | Humano | Errores típicos | Escala | Métrica |
|-------|----------|-------|------|--------|-----------------|--------|---------|
| SOURCE | Identifica origen | source_id, ToS class | sí | registry | fuente muerta | N fuentes | source_freshness |
| DISCOVERY | Encuentra candidatos | URL/ID/precio | sí | seeds | ruido | queues | candidates/h |
| INGESTION | Persiste raw | payload + provenance | sí | — | schema drift | workers | ingest_ok_rate |
| NORMALIZATION | IngestItem canónico | precio, moneda, store | sí | reglas | parse fail | CPU barato | normalize_fail |
| PRODUCT MATCHING | Canonical product | ASIN/ML/EAN/title | parcial | review edge | merge erróneo | graph | match_precision |
| PRICE CHECK | Precio vivo | API/feed/page | sí | — | stale | Redis cache | price_age_s |
| HISTORICAL | Baseline | snapshots | sí | — | cold start | Postgres | samples_90d |
| COUPON | Código + reglas | coupon_obs | parcial | verify | falso código | community | coupon_success |
| PROMOTION | Campañas/banco | promo calendar | parcial | calendar ops | stacking illegal | rules engine | promo_conf |
| SCORING | 0–100 / A–D | features | sí | calibrate | overfit | batch+online | precision@K |
| FP FILTER | Glitch vs deal | anomaly | sí | high stakes | miss glitch | thresholds | FP rate |
| MODERATION | Approve/reject | HITL | assisted | sí | backlog | claim locks | throughput |
| PUBLISH | Offer live | creative+aff | gated | policy | bad copy | fanout | publish_lat |
| DISTRIBUTION | Canales | deal_id | sí | channel policy | rate limits | queues | deliver_ok |
| CLICK/AFF | Tracking | offer_events | sí | — | attrib gap | — | CTR / RPD* |
| FEEDBACK | Votes/expired | community | sí | — | brigading | — | signal quality |
| LEARNING | Reweight | labels | offline→online | govern | leakage | experiments | lift |

\*Revenue per deal: limitado hoy por ausencia de API de conversiones (**CONFIRMADO** en research afiliados Aventa).

---

## 3. Discovery Engine — matriz de fuentes

### A. APIs oficiales

| Fuente | Datos | Histórico | Promos/cupones | ToS comercial | Estado Aventa | Evidencia |
|--------|-------|-----------|----------------|---------------|---------------|-----------|
| **Amazon Creators API** | Catálogo, precio actual, OffersV2 | **NO** (API no entrega history) | DealDetails limitados | Associates + OAuth | OFF / migrar PA-API→Creators | Docs oficiales Creators |
| **Keepa API** | History Amazon, deals, buybox | **SÍ** | Deals endpoint | Comercial de pago (tokens) | Código `keepa.ts` OFF | keepa.com/api-docs |
| **ML Items / Search / Prices** | Item, search, sale_price, prices | Propio si se snapshottea | Seller-promotions **requiere token seller** | App ML + scopes | Worker vivo; API legacy 403 en cloud | Developers ML + SoT Aventa |
| **ML Afiliados** | Links/etiquetas UI | N/A | N/A | Programa afiliados | Tags en código | Research affiliate 2026-09-16 |
| **Walmart / AliExpress / Shopify** | Varían por partner | Generalmente no | Feeds/partners | Por contrato | No productivo | **DESCONOCIDO** acceso MX concreto |
| **Google Shopping / Merchant** | Aggregated | Limitado | Limitado | ToS Google | No | **DESCONOCIDO** fit MX deals |
| **Coupon APIs** | Códigos agregados | N/A | Sí (calidad variable) | Partner | No | **DESCONOCIDO** sin vendor elegido |

### B. Feeds

Product/affiliate/XML/CSV/JSON/RSS/sitemaps: **PROBABLE** útiles para retailers día-a-día. Aventa registry: `affiliate_feed` / `partner` = **NOT_CONFIGURED** (**CONFIRMADO** código/docs).

### C. Price tracking

| Mecanismo | Evidencia |
|-----------|-----------|
| Price Memory propio (`product_price_snapshots`) | **CONFIRMADO** Aventa SoT |
| Percentiles / habitual / near low | **CONFIRMADO** DQE thresholds (≥12% bajo habitual, near min 5%) |
| Keepa history Amazon | **CONFIRMADO** docs Keepa |
| Alertas drop | **PROBABLE** construir sobre snapshots + cola |

### D. Public web data

| Método | Posición Aventa |
|--------|-----------------|
| API oficial | Preferido |
| FEED contractual | Preferido |
| Structured data / JSON-LD páginas públicas | **HIPÓTESIS** usable si ToS lo permite y sin bypass |
| Playwright worker (ML) | **CONFIRMADO** en producción como camino B |
| Scraping / CAPTCHA bypass / auth bypass | **PROHIBIDO** en esta arquitectura |

---

## 4. Price Intelligence — DEAL QUALITY SCORE

### Principio

`precio_actual < precio_anterior` es insuficiente (**CONFIRMADO** por diseño DQE Aventa y literatura de price intelligence).

### Señales (matemática propuesta)

Definiciones (por `canonical_product_id`, marketplace, seller opcional):

- \(P_t\): precio observado ahora (incl. shipping si conocido)  
- \(H_{90}\): distribución de precios 90 días  
- \(p_{10}, p_{25}, med, p_{75}\): percentiles  
- \(P_{min90}\), \(P_{hab}\) (habitual Aventa)  
- \(d_{nom}\): descuento nominal vs list price (puede ser artificial)  
- \(d_{eff}\): descuento efectivo vs baseline histórico  
- \(v\): volatilidad (CV de \(H_{90}\))  
- \(c\): confianza de datos ∈ [0,1] (samples, age, provenance)

**Score propuesto V0 (explicable, no entrenado):**

\[
DQS = 100 \cdot c \cdot \big(
  w_1 \cdot f_{pct}(P_t; H_{90}) +
  w_2 \cdot f_{drop}(P_t, P_{hab}) +
  w_3 \cdot f_{nearmin}(P_t, P_{min90}) +
  w_4 \cdot f_{eff}(d_{eff}) +
  w_5 \cdot f_{stock} +
  w_6 \cdot f_{ship} +
  w_7 \cdot f_{seller} -
  w_8 \cdot f_{anomaly} -
  w_9 \cdot f_{artificial\_list}
\big)
\]

Pesos iniciales justificados (heurísticos → calibrar):

| Peso | Valor V0 | Justificación |
|------|----------|---------------|
| \(w_1\) percentile | 0.30 | Responde “¿barato vs historia?” |
| \(w_2\) vs habitual | 0.20 | Alineado DQE (≥12%/20%) **CONFIRMADO** código |
| \(w_3\) near min | 0.15 | Captura “mejor momento” |
| \(w_4\) effective stack | 0.15 | Cupón/banco solo si verificable |
| \(w_5\)–\(w_7\) | 0.10 | Contexto compra |
| \(w_8\)–\(w_9\) | 0.10 | Anti-FP |

**CONFIRMADO:** Aventa ya tiene reglas cualitativas (no score 0–100) en `dealQuality`.  
**HIPÓTESIS:** un score 0–100 aprendido con labels de moderación + votos + “expired” batirá la heurística en 4–8 semanas de datos.

---

## 5. Coupon Intelligence

### Capas de precio efectivo

```text
BASE (sticker o standard)
→ STORE_DISCOUNT (promotion price)
→ COUPON (si stackable)
→ BANK_BONUS (diferido; no en checkout)
→ CASHBACK (diferido)
→ SHIPPING
→ MEMBERSHIP / VARIANT constraints
→ FINAL_EFFECTIVE (con flags de certeza)
```

### Composición matemática (**CONFIRMADO** principio; reglas por merchant **DESCONOCIDO** hasta modelar)

Porcentajes secuenciales:

\[
P_{after} = P_{base} \prod_i (1 - r_i)
\]

Ejemplo: 20% + 10% → \(0.8 \times 0.9 = 0.72\) → **28% efectivo**, no 30%.

Montos fijos: restar después de porcentajes (o según regla del merchant).

### Hallazgos México

| Tipo | Efecto en precio | Evidencia |
|------|------------------|-----------|
| Descuento tienda | Reduce checkout | ML promotions / retailer |
| Cupón código | Reduce si válido y stackable | Merchant-specific |
| MSI | **No** reduce precio; financia | Bancos MX (BBVA/Banamex Hot Sale) |
| Bonificación bancaria | Reduce **efectivo** diferido; topes, registro, plazos | BBVA/Banamex/Banorte vía PD |
| Cashback | Diferido | Partner |

**CONFIRMADO:** no se puede asumir acumulabilidad.  
**PROBABLE:** la verificación real de cupones requiere re-check + comunidad (“works”/“expired”).  
**DESCONOCIDO:** API única MX de cupones bancarios.

---

## 6. Promotion Intelligence / Calendar Engine

| Campaña | Anticipación | Evidencia |
|---------|--------------|-----------|
| Buen Fin / Hot Sale / BF / Cyber / Prime Day | Calendario público + spikes de supply | App PD menciona calendario; retailers MX |
| Liquidaciones / DOD / Lightning ML | Endpoints seller-promotions | Docs ML (token seller) |
| Promos bancarias | Scraping de micrositios bancos **o** curación | Páginas oficiales bancos |

**PROMOTION CALENDAR ENGINE:** **SÍ construir** como tabla `promotion_windows` + multipliers de discovery rate.  
Anticipación “aumentará descuentos” = **PROBABLE**, no garantía de calidad (precios de referencia a menudo se inflan antes — **HIPÓTESIS** conocida en industria).

---

## 7. Product Identity

| ID | Uso | Confianza |
|----|-----|-----------|
| Amazon ASIN | Clave Amazon | Alta si Creators/Keepa |
| ML ITEM_ID / catalog | Clave ML | Alta |
| EAN/UPC/GTIN | Cross-marketplace | Media (cobertura) |
| Brand+Model+attrs | Fuzzy | Baja–media |
| `product_fingerprint` Aventa | Dedupe actual | **CONFIRMADO** código |

Entity resolution: bloqueo por GTIN/ASIN → scoring título/attrs → human review en merges ambiguos.  
**HIPÓTESIS:** graph `canonical_products` es moat a 12+ meses.

---

## 8. Error price / GLITCH CONFIDENCE

Señales de glitch:

- \(P_t \ll p_{01}\) con stock “alto”  
- Descuento absurdo vs categoría  
- Precio sin shipping / variante incorrecta  
- Cupón “accidentalmente” stackable (comunidad)  
- Moneda/seller anómalo  

\[
GCS = \sigma\big(\alpha_1 z_{price} + \alpha_2 novelty + \alpha_3 source\_trust - \alpha_4 corroboration\big)
\]

Policy: **GCS alto → REVIEW o HOLD**, no auto-publish viral.  
Falsos glitches matan confianza (**PROBABLE** por experiencia de comunidades).

---

## 9. Deal Scoring Engine (A–D / 0–100)

Mapa:

| Grado | DQS | Acción sugerida |
|-------|-----|-----------------|
| A | ≥80 + c≥0.7 | Auto-publish candidato |
| B | 60–79 | Review rápido |
| C | 40–59 | Cola normal |
| D | <40 | Reject / no insert |

Variables con más peso (justificación): **historial percentil + effective discount verificable + confidence**; menos peso a descuento nominal y popularidad temprana (cold start).

Aprendizaje: logistic/GBDT offline con labels `approved|rejected|expired|high_votes|conversion_proxy`; shadow → live.

---

## 10. Community Signals → Feedback Loop

**CONFIRMADO Aventa:** votos, comentarios, outbound clicks, reports, moderation.  
**CONFIRMADO Pepper/PD:** temperatura + comentarios + “expired” social.

Loop:

```text
publish → impressions → clicks → votes/comments/expired
→ labels → retrain scoring / coupon success → better ranking
```

Comunidad = sistema de entrenamiento (**PROBABLE** moat).

---

## 11. Telegram / WhatsApp

| | Telegram | WhatsApp Cloud API |
|--|----------|-------------------|
| MVP | **Mejor** (canales + bot, sin templates marketing complejos) | Posible pero fricción templates |
| Escala broadcast | ~30 msg/s gratis; paid hasta 1000/s (Stars) | Throughput hasta 80 msg/s/número; **messaging limits** por tier (250→…) |
| Opt-in | Canal join / bot start | Obligatorio; ventanas 24h |
| Evidencia | Bot FAQ oficial Telegram | Meta Messaging Limits docs |

**CONCLUSIÓN:** Telegram para distribución de deals a escala; WhatsApp para alertas personalizadas opt-in de alto valor. No asumir WA como broadcast masivo ilimitado (**CONFIRMADO** límites Meta).

---

## 12–13. Automatic publishing & multi-channel

```text
DEAL → VALIDATE → SCORE → (AUTO|REVIEW|REJECT)
→ AFFILIATE LINK → CREATIVE → deal_publications × channels
```

**ONE DEAL → MANY CHANNELS** vía `deal_publications(deal_id, channel, payload, status)`.  
Creative: plantillas + LLM opcional (no dependencia). Imagen desde fuente. Expiration re-check.

---

## 14. Automation levels

| Level | Estado Aventa hoy |
|-------|-------------------|
| 0 Manual | Comunidad + mods |
| 1 Assisted | Parse URL, enrichment |
| 2 Auto discovery | ML Worker **CONFIRMADO** |
| 3 Auto validation | DQE + qualification **parcial** |
| 4 Auto publishing | **OFF** en prod (SoT) |
| 5 Autonomous | Shadow only |

**Hoy:** ~2.5  
**Objetivo 90 días:** 3 sólido + 4 gated  
**Objetivo 12 meses:** 4 amplio + 5 en nichos de alta confianza

---

## 15. Human-in-the-loop

| Confianza | Acción |
|-----------|--------|
| alta (A + c) | AUTO-PUBLISH |
| media | REVIEW |
| baja / glitch / bank-only / membership | REJECT o HOLD |

Moderación permanece para edge cases, no como cuello para 100% del volumen (**objetivo**).

---

## 16. Deal Validation Engine

Checks: precio live, stock, variant, shipping, coupon probe, membership flag, seller change, currency, expiration TTL.

Salida: `deal_validation(status, reasons[], observed_at)`.

---

## 17. Speed / latency architecture

| Events/day | Arquitectura |
|------------|--------------|
| 100 | Cron + serverless OK |
| 1,000 | Cron + short queues |
| 10,000 | Event queue + persistent workers |
| 100,000 | Particionado por source, Redis, workers horizontales, webhooks donde existan |

Transición CRON→EVENT cuando p95 detection→publish > SLA o full scans desperdician cuota.

Stack alineado Aventa: Vercel crons + GHA workers + Upstash Redis + Supabase + (futuro) cola dedicada (Upstash Q / similar).

---

## 18. Arquitectura objetivo Aventa (reuse)

### Reutilizar (**CONFIRMADO**)

- Next.js / Supabase / Vercel / Upstash / GHA  
- ML Worker Playwright  
- Hunter + Supply Router (Truth)  
- IngestItem contrato  
- DQE / qualification / verifier  
- Price Memory product snapshots  
- Moderation OS + locks  
- Attribution Foundation (clicks) — sin settlement  
- Affiliate link builders Amazon/ML  

### Extender

- Score 0–100 + auto-publish gates  
- `deal_candidates` separados de `offers`  
- Coupon/promo observations  
- Canonical products  
- Distribution bus  
- Supply Control Center CEO  

### No reemplazar sin razón

- No destruir Moderation OS  
- No unificar ciegamente Router (dry-run) con persist path sin migración explícita  
- No activar money path en esta fase  

### Falta (gap)

- Creators API Amazon live  
- Keepa productivo  
- Feeds retailers  
- Coupon success dataset  
- Multi-channel publisher  
- Event bus formal  
- Learning loop offline  

---

## 19. Data model (mínimo necesario)

| Entidad | Propósito | Retención | Volumen (orden) |
|---------|-----------|-----------|-----------------|
| `sources` | Registry | permanente | 10² |
| `source_products` | IDs externos | 1–2 años | 10⁶–10⁷ |
| `canonical_products` | Entity | permanente | 10⁶ |
| `price_observations` | Tick precio | 90d raw / agg forever | alto → partition by day |
| `coupon_observations` | Códigos + outcome | 1 año | 10⁵ |
| `promotion_observations` | Campañas | 2 años | 10⁵ |
| `deal_candidates` | Pre-offer | 30–90d | 10⁶/año |
| `deal_scores` | Features+score | 180d | = candidates |
| `deal_validations` | Re-checks | 90d | alto |
| `deal_events` | Pipeline audit | 180d | alto |
| `deal_publications` | Fanout | 1 año | medio |
| `source_health` | Ops | 90d | bajo |
| `detection_runs` | Batch meta | 90d | medio |

Índices clave: `(canonical_id, observed_at)`, `(source, external_id)`, `(deal_id, channel)`, GIN reasons.

No crear tablas “por si acaso”: stock puede vivir en `price_observations` attrs JSONB hasta necesidad.

---

## 20. Event-driven

**Sí evolucionar**, pero **después** de estabilizar Price Memory + DQS + validation.  
Hoy cron/worker es suficiente para cientos–miles/día.  
Trigger de migración: cuota API, latencia, o fanout multi-canal.

---

## 21. Observability + Supply Control Center

Métricas pedidas: todas aplicables. Prioridad CEO:

1. verified_deals/hour  
2. false_positive_rate (post-publish expired/report)  
3. detection→publish latency p50/p95  
4. source_freshness  
5. moderation backlog  
6. revenue proxy (clicks; no commission API — **CONFIRMADO** limitación)

---

## 22. Economics (órdenes de magnitud conceptuales)

Sin inventar precios de vendors: costos crecen con **observations**, no con “deals publicados”.

| Escala | Driver costo | Nota |
|--------|--------------|------|
| 10k deals/day candidatos | DB writes + workers | Viable en stack actual con filtrado agresivo |
| 100k/day | Keepa tokens + Postgres + queues | Requiere presupuesto data |
| 1M/day | Multi-region workers + cold storage | Solo con partner feeds |

Unit economics: publicar solo top-K por score; observar barato, publicar caro (reputación).

---

## 23. Competitive moat

| Activo | Dificultad de copia | Notas |
|--------|---------------------|-------|
| Price history propio MX | Alta | Tiempo |
| Coupon success labels | Muy alta | Comunidad |
| Deal quality dataset (mod+votes) | Alta | |
| Product graph MX | Alta | |
| Community cazadores | Alta | Estrategia PD canvas |
| Ranking personalizado | Media | |
| Scraper frágil | Nula | No es moat |

---

## 24. Holy Grail — AVENTA DEAL INTELLIGENCE ENGINE

Sistema que responde:

1. ¿Qué está significativamente más barato **ahora**? → Price Memory + DQS  
2. ¿Qué promo aún no descubrió el consumidor? → latency advantage + calendar  
3. ¿Precio efectivo real? → stack model con **confidence** y capas diferidas  
4. ¿Merece Aventa? → score + validation + policy  
5. ¿Qué canal? → channel router (web default; TG para flash; WA para alertas)

---

## 25. Experimentos

### EXPERIMENT A — Manual vs sistema
- **H:** recall≥60% de deals humanos top en 48h  
- **n:** 100 deals PD/TG curados  
- **Métrica:** precision/recall vs gold  
- **Éxito:** recall≥0.6 precision≥0.5  

### EXPERIMENT B — Histórico
- **H:** percentil≤20 predice aprobación mejor que % nominal  
- **Método:** AUC en cola moderación  

### EXPERIMENT C — Cupones
- **H:** auto-detect códigos con success≥40% en re-check 1h  
- **Éxito:** success rate medido; si <20% → human-only coupons  

### EXPERIMENT D — Canales
- **H:** TG flash CTR > web para deals A en 1h  
- **n:** 50 deals A  

### EXPERIMENT E — Detector FP
- **H:** GCS reduce quejas “fake discount” ≥30%  
- **Método:** A/B shadow  

Sesgos: PD no es ground truth absoluto; popularidad ≠ valor.

---

## 26. Scientific scorecard

| Hipótesis | Evidencia | Confidence | Test | Impacto |
|-----------|-----------|------------|------|---------|
| Comunidades grandes son UGC+mods+afiliados | FAQ PD/Pepper | Alta | — | Estratégico |
| Price history propio es núcleo de “¿barato?” | DQE + Keepa gap Amazon | Alta | Exp B | Crítico |
| Creators API no da history | Docs Amazon | Alta | — | Crítico |
| Seller-promotions ML no es supply afiliado | Docs ML + SoT | Alta | — | Alto |
| Stack % es multiplicativo | Math + merchant practice | Alta | Exp C | Alto |
| Bonificación bancaria ≠ descuento checkout | Bancos MX | Alta | — | Alto |
| Auto-publish total hoy | SoT OFF | Alta | — | Ops |
| Telegram > WA para broadcast MVP | Rate limit docs | Alta | Exp D | Medio |
| Level 5 en 90 días | Gaps coupon/attrib | Baja | Roadmap | — |
| Miles deals/día detectables | Worker+APIs+community | Media | Exp A | Crítico |
| Precio efectivo 100% auto | Cupones/bancos opacos | Baja | Exp C | Crítico |

---

## 27. Final architecture (textual)

```text
[Sources: Community | ML Worker | Creators API | Keepa | Feeds | Calendar]
        │
        ▼
   Discovery Queue (Redis)
        │
        ▼
   Normalize → Match → Price Observe → Price Memory
        │
        ├─ Coupon/Promo engines (low confidence default)
        ▼
   Deal Candidate + DQS + Validation
        │
   ┌────┴────┐
 AUTO     REVIEW     REJECT
   │         │
   ▼         ▼
 offers(approved|pending) → Moderation OS
        │
        ▼
 Distribution Bus → Web | TG | WA | Email | Push | Social
        │
        ▼
 Clicks/Votes/Expired → Learning (offline) → weight updates
```

Attribution Foundation observa clicks; settlement permanece OFF.

---

## 28. Roadmap por fases (resumen)

| Phase | Objetivo | Exit |
|-------|----------|------|
| 0 Research | Este doc | Done |
| 1 Acquisition | Creators+Keepa+feeds pilots | ≥3 sources vivos |
| 2 Normalization | Canonical IDs | match precision≥0.9 sample |
| 3 Price Intel | DQS 0–100 | Exp B pass |
| 4 Coupon | Observations + success | Exp C measured |
| 5 Scoring | Rank A–D | shadow metrics |
| 6 Validation | Re-check engine | FP↓ |
| 7 Auto publish | Gates A | <5% emergency revert |
| 8 Multi-channel | TG+web | Exp D |
| 9 Learning | Retrain loop | lift≥10% |
| 10 Autonomous | Nichos full-auto | Level 5 parcial |

---

## 29. What NOT to do

- Scrapers frágiles como moat  
- Una sola fuente  
- APIs no oficiales / bypass CAPTCHA/auth  
- Inventar % descuento  
- Datos sin provenance  
- Duplicar pipelines Router vs persist sin contrato  
- Cron full-scan infinito  
- Lógica de negocio en frontend  
- Secretos en cliente  
- IA como juez único  
- Moderación manual masiva como diseño permanente  
- Activar settlement en research  

---

## 30. Respuesta a la pregunta central

### ¿Es posible construir el sistema descrito?

**PARCIALMENTE SÍ — con evidencia.**

| Capacidad | Veredicto | Limitante |
|-----------|-----------|-----------|
| Detectar miles de oportunidades/día | **SÍ (técnico)** | Cuotas API, costo Keepa, yield ML |
| Calcular precio efectivo con cupones/promos | **PARCIAL** | Stacking merchant/banco no expuesto por API única; MSI no baja precio |
| Determinar calidad | **SÍ** | Requiere history density |
| Publicar mejores casi RT | **SÍ gated** | HITL + validation; auto-publish total no justificado aún |
| Feedback económico por conversión | **NO vía API oficial hoy** | Research afiliados: sin webhook/commission API event-level |

### Componentes: tenemos / faltan

**Tenemos:** ML Worker, Hunter/Supply Truth, IngestItem, DQE, Price Memory, Moderation OS, clicks/attribution foundation, affiliate link builders, Redis/Vercel/Supabase.

**Faltan:** Creators API prod, Keepa prod, deal_candidates formal, DQS 0–100 + gates, coupon success loop, promo calendar, canonical products, distribution bus, learning offline, Supply Control Center.

### Plan experimental para demostrar

Ejecutar Experimentos A–E en 90 días; go/no-go de Phase 7 (auto-publish) solo si FP rate y Exp B/C cumplen umbrales.

---

## Entregable A–J (resumen ejecutivo embebido)

Ver también canvas: Supply Intelligence Engine (sesión).

### A. Executive summary
Aventa puede construir un Supply Intelligence Engine superior en **detección + price intelligence + validación**, reutilizando su stack. No debe intentar clonar Pepper solo con scrapers. El cuello actual es liquidez de ofertas aprobadas y auto-publish OFF. El precio efectivo con bancos/cupones será siempre **probabilístico** hasta tener dataset de éxito comunitario.

### B. How deal communities work
UGC → moderación → votos → afiliados. Automatización interna = mayormente **DESCONOCIDO**.

### C. Discovery matrix
Ver §3.

### D. Target architecture
Ver §18–20, §27.

### E. Holy Grail
Ver §24.

### F. 90-day roadmap
Phase 1–6 + TG piloto; no Level 5.

### G. Experiment plan
§25.

### H. Technical specification
Sources, queues, workers, Price Memory, DQE→DQS, validation, moderation gates, distribution, observability.

### I. Risks
Legales (ToS), económicos (tokens), operativos (FP), técnicos (403 ML), atribución (sin commission API).

### J. Top 10 actions
1. Activar Amazon Creators API (catálogo/precio actual)  
2. Activar Keepa para history Amazon  
3. Expandir Price Memory coverage ML  
4. Separar `deal_candidates` de `offers`  
5. Implementar DQS 0–100 + shadow  
6. Validation re-check pre-publish  
7. Gates AUTO/REVIEW/REJECT  
8. Coupon observations + community “works”  
9. Telegram distribution bus MVP  
10. Experimentos A/B con métricas CEO  

---

*Fin del informe. No se activó money/settlement.*
