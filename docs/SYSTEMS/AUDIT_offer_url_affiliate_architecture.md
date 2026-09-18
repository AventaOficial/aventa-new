# AUDIT — Offer URL / Affiliate Link Architecture

**Fecha:** 2026-09-17  
**Modo:** Architectural audit only. **Sin código, migraciones, deploy ni money path.**  
**Trigger:** `https://link.amazon/…` rechazada en “Comparte una oferta”; `amazon.com.mx/…` aceptada.

---

## 1. Current architecture

### Roles de URL hoy (CONFIRMED)

| Rol conceptual | Campo / mecanismo | ¿Separado? |
|----------------|-------------------|------------|
| Producto / “canónica” | `offers.original_offer_url` | Parcial (nullable; históricos NULL) |
| Operativa / monetizada | `offers.offer_url` | Mezcla producto+tags plataforma |
| Tracking por click | `ascsubtag` (Amazon) al abrir CTA | **No** persistido en offers |
| Snapshot al click | `reward_outbound_clicks.destination_url` + `original_destination_url` | Sí |

### Dualidad peligrosa de validación (CONFIRMED)

| Superficie | Regla |
|------------|--------|
| UI parse `POST /api/parse-offer-url` | Allowlist comercio + SSRF + redirects hop-a-hop |
| Create `POST /api/offers` | Solo HTTPS genérico (`validatePublicOfferUrl`) — **sin** allowlist |

El usuario público **sí** choca con allowlist vía ActionBar (gate `urlParseKind === 'ok'`).

---

## 2. Current URL validation contract

### Mensajes (no existe literal “URL no válida”)

| Contexto | Mensaje típico | Path |
|----------|----------------|------|
| Parse UI | `Este enlace no es válido. Revisa que sea una URL de tienda (https://…).` | `ActionBar` ← `reason: invalid_url` |
| Parse allowlist | `Este enlace no se puede usar…` | `parse-offer-url` |
| Create API | `URL de oferta inválida` / `…debe usar HTTPS` / `…no permitida` | `validatePublicOfferUrl` |

### Allowlist Amazon (parse/fetch)

`lib/offers/commerceHostAllowlist.ts`:

- `amazon.com`, `amazon.com.mx`, … TLDs Amazon  
- Short: `amzn.to`, `a.co`  
- **NO** incluye `link.amazon` como dominio registrado  

Match: `host === domain || host.endsWith('.' + domain)` — seguro frente a `evil-amazon.com`.

### Shortlinks resueltos

- ML: `meli.la`  
- Amazon: **solo** `amzn.to` | `a.co`  
- `link.amazon` **no** es shortlink en código

### Redirects

- Max 5 hops; cada hop re-valida HTTPS + allowlist + anti-SSRF  
- Create path **no** sigue redirects genéricos

### Open redirect

- Aventa no ofrece open-redirect outbound en este flujo  
- Riesgo mitigado en fetch: Location validada antes de hop

---

## 3. Amazon URL behavior

| Input | ¿Parse UI? | ¿Create API? | Notas |
|-------|------------|--------------|-------|
| 1. `amazon.com.mx/.../dp/ASIN` | ✅ allowlist | ✅ HTTPS | Tag aplicado si fingerprint ASIN |
| 2. `amzn.to` / `a.co` | ✅ expand | Expand en resolve | Si no expande, puede quedar short; tagging frágil |
| 3. `https://link.amazon/XXXX` | ❌ **rechazo** | ✅ HTTPS puro (bypass UI) | Host `link.amazon` **≠** bajo `amazon.com` |
| 4. URL con `?tag=` ajeno | ✅ si host OK | ✅ | Resolve sobrescribe tag Aventa; original conserva pegado |
| 5. Redirect genérico → Amazon | Solo si hop allowlisted | No genérico | Cadena maliciosa fuera de allowlist → fail |

### Root cause del caso reportado (CONFIRMED)

`link.amazon` **no está** en `AMAZON_REGISTERED_DOMAINS`.  
El parser público usa `requireAllowlist: true` → `invalid_url` → copy “enlace no válido”.  
**No** es un bug de “Amazon mal detectado”; es rechazo **correcto bajo allowlist actual**.

Agregar `link.amazon` a allowlist **sin** arquitectura = parche (explícitamente fuera de alcance).

---

## 4. Security analysis

| Riesgo | Si aceptamos affiliate/redirect públicos crudos | Mitigación actual |
|--------|--------------------------------------------------|-------------------|
| Open redirect / phishing CTA | Alta tras approve | Allowlist UI; create API **débil** |
| Redirect chains / SSRF | Media | Hop validation + private IP block |
| Malicious domains | Alta si create sin allowlist | UI bloquea; API no |
| URL confusion (`link.amazon` vs `amazon.com`) | Media | Allowlist exacta (por eso falla hoy) |
| Attribution bypass | Media | Track usa DB; **CTA abre URL del cliente** |
| Affiliate hijacking (tag ajeno) | Media | Sobrescribe tag en resolve; original puede conservar ajeno |
| Tracking abuse | Baja–Media | `ascsubtag` solo al hop; no persistido |

**Invariant deseada:** nunca convertir redirect no confiable en URL de salida sin canonicalización a producto allowlisted + tags Aventa.

---

## 5. Canonical vs affiliate URL model

### Hoy

```
original_offer_url  ≈  producto (a veces ya tagged / short / null)
offer_url           ≈  producto expandido + platform tags (sin ascsubtag)
(buildOfferUrl@click) ≈  offer_url + ascsubtag (Amazon)
```

### Separación correcta (propuesta conceptual — sin columnas nuevas aún)

| Concepto | Definición |
|----------|------------|
| `canonical_retailer_url` | Permalink producto limpio (ASIN/ML id), sin tags Aventa ni de terceros |
| `monetization_url` | Canonical + tags oficiales Aventa (Associate tag / ML matt) |
| `outbound_url` | Monetization + tracking efímero (`click_id` / `ascsubtag`) al hop |

Hoy: (1)≈`original_offer_url`, (2)≈`offer_url`, (3)=runtime only.

---

## 6. Public submission flow

```
ActionBar paste
  → normalizePastedOfferUrl
  → POST /api/parse-offer-url  [ALLOWLIST + redirects]
  → gate: reason === 'ok'
  → POST /api/offers
       validatePublicOfferUrl [HTTPS only]
       original_offer_url = validated href
       offer_url = resolveAndNormalizeAffiliateOfferUrl
       status = pending
```

**Monetización debería intervenir:** en create **después** de canonicalización a producto allowlisted (hoy: resolve+tags, incompleto para `link.amazon`).

---

## 7. Moderation flow

```
claim → edit FixSheet / prepareAffiliateLink
  → PATCH update-offer
       affiliate_paste: valida same product + tagged
       else: puede setear original=pasted si original vacío
  → approve (assertAffiliateReadiness)
  → re-resolve + tags
```

**Monetización / override:** paste afiliado en Focus es el camino legítimo para URL de monetización explícita — **mismo pipeline**, no segunda cola.

---

## 8. Outbound tracking flow

```
CTA → trackAndOpenOfferUrl
  → POST /api/track-outbound { offerId }   // body.offerUrl IGNORADO
  → recordAttributedClick ← DB offer_url / original_offer_url
  → window.open(buildOfferUrl(client offerUrl, { clickId }))
```

**Gap:** hop navegación usa URL del **cliente**, no `destinationUrl` de la API → tampering posible post-approve.

Aventa `click_id` sigue siendo autoridad de atribución en DB.

---

## 9. Risks (summary)

1. Allowlist UI vs create API asimétricos.  
2. `link.amazon` rechazado (esperado con allowlist) — usuarios confunden con “Amazon válido”.  
3. Shortlinks no expandidos + falso positivo tagged.  
4. FixSheet sin `affiliate_paste` puede contaminar `original_offer_url`.  
5. CTA no usa destination server-side.  
6. Parche allowlist-only de `link.amazon` sin expand→canonical = riesgo de persistir redirect opaco.

---

## 10. Proposed architecture

### OPTION A — Aceptar affiliate URLs públicamente  
Ampliar allowlist / aceptar `link.amazon` en submit.  
**Pros:** menos fricción.  
**Contras:** confunde canonical vs monetization; riesgo hijacking/tag; contradice “Aventa genera afiliado”.  
**Fit Aventa:** **malo**.

### OPTION B — Solo canonical público; affiliate server-side  
Público: solo permalinks producto (`amazon.*/dp`, ML item, etc.). Server: tags Aventa.  
**Pros:** SoT limpia; tracking Aventa intacto.  
**Contras:** UX: usuario con solo `link.amazon` debe expandir o pegar producto.  
**Fit:** **bueno** a largo plazo.

### OPTION C — Canonical público + affiliate override solo moderación/admin  
Público: canónicas (y shorts **expandidos** a canónica: `amzn.to`/`a.co`).  
Opcional futuro: resolver `link.amazon` **solo** si expand seguro → product URL allowlisted (no persistir el link opaco).  
Moderación: “URL canónica” + “URL monetización (opcional)” en FixSheet/prepare — **una oferta**.  
**Pros:** alinea con `original_offer_url` / `offer_url` / Focus paste actuales; no segundo pipeline.  
**Contras:** requiere UX clara; expand `link.amazon` = trabajo futuro con evidencia.  
**Fit Aventa:** **mejor**.

### Recommended: **OPTION C** (hacia B)

- No allowlist-parche de `link.amazon` como destino persistido.  
- Público aporta producto canónico (o short expandible hoy).  
- Aventa escribe monetization en `offer_url`.  
- Moderación puede override monetization vía `affiliate_paste` existente.  
- Tracking permanece en hop + `click_id`.

---

## 11. Invariants

1. Persistencia pública solo HTTPS + (futuro) host producto allowlisted.  
2. `original_offer_url` nunca se inventa desde URL ya monetizada.  
3. `offer_url` de salida siempre lleva tags Aventa cuando el programa aplica.  
4. Tracking (`ascsubtag`/`click_id`) no sustituye canonical.  
5. Redirect/short solo → hop allowlisted → producto; si no, rechazo.  
6. Un solo pipeline: pending → Focus → approve → feed.  
7. Attribution: track lee DB, no body.  
8. Settlement/rewards/ledger/Supply/DQE/auto* — **no tocar** en esta línea.

---

## 12. Migration implications

| Cambio | ¿Migración DB? |
|--------|----------------|
| Clarificar UX / validación / expand `link.amazon`→product | No necesariamente |
| Renombrar columnas a canonical/monetization | Opcional; puede ser alias mental sobre campos actuales |
| Tercera columna tracking | **No** recomendada |
| Allowlist en `POST /api/offers` | Solo código |

Backfill: no inventar `original_offer_url` desde `offer_url` tagged (política existente).

---

## 13. Exact implementation plan (futuro — NO ahora)

**P0 (siguiente):**  
1. Documentar en UI pública: “Pega el enlace del producto (amazon.com.mx/…/dp/…), no el link corto de afiliado `link.amazon`”.  
2. Unificar mensaje de error parse→copy que mencione “enlace de producto de la tienda”.  
3. Diseño técnico: ¿`link.amazon` se puede expandir con el mismo `fetchFollowingRedirectsSafely` + destino `amazon.*`+ASIN? (spike read-only / test).  

**P1:** Allowlist en create API alineada con parse.  
**P1:** FixSheet labels “URL canónica” / flujo affiliate_paste explícito.  
**P2:** CTA preferir `destinationUrl` server o `/out/[id]` (Option C hop).  
**Nunca en P0 URL:** settlement, rewards, Supply, segunda cola.

---

## 14. Safety statements

| Dominio | Estado esta auditoría |
|---------|----------------------|
| Money / settlement / ledger / rewards / payouts | Sin tocar |
| Supply WRITE | Sin tocar |
| Attribution schema / track-outbound contract | Sin tocar |
| DQE / autoApprove / autoPublish | Sin tocar |

---

## DETENTE

Audit only. Artefacto: este documento. Sin implementación.
