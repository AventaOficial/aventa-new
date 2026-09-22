# SYSTEM — Offer URL Extraction (parse + imágenes + preview)

**Estado:** canónico para “Subir oferta” / `POST /api/parse-offer-url`  
**Última alineación con código:** 2026-09-22  
**Docs relacionadas:**
- [`SYSTEM_upload_offer.md`](./SYSTEM_upload_offer.md) — flujo UI → publish
- [`PARSE_OFFER_MELI_LA_GALERIA.md`](../PARSE_OFFER_MELI_LA_GALERIA.md) — incidente/fix galería `meli.la`
- [`AUDIT_offer_url_affiliate_architecture.md`](./AUDIT_offer_url_affiliate_architecture.md) — afiliados vs allowlist
- Código vivo: `lib/offers/urlResolution/*`, `lib/offers/parseOfferPageHtml.ts`, `lib/offers/productExtraction/*`

---

## 1. Principio (no negociable)

Aventa **no** hace fetch a Internet abierto.

Un enlace solo se procesa si:

1. Es HTTPS  
2. El host está en **allowlist de comercio** (`commerceHostAllowlist.ts`)  
3. Los redirects solo saltan a hosts también allowlisteados (SSRF)  
4. Tras resolver, se identifica retailer → se extrae producto → se normaliza preview  

**Objetivo correcto:**  
> Cualquier link de tienda **soportada** produce título / precio / imágenes / categoría cuando la página lo permite.

**Objetivo incorrecto:**  
> “Cualquier URL del mundo” → eso es SSRF y está prohibido.

---

## 2. Pipeline canónico

```text
USER URL (paste)
    │
    ▼
normalizePastedOfferUrl          lib/offerUrl.ts
    │
    ▼
assertSafeOfferFetchUrl          allowlist + HTTPS + no IPs privadas
    │
    ▼
resolveOfferUrl                  lib/offers/urlResolution/
    │  detectProvider
    │  ├── AmazonResolver        a.co / amzn.to / link.amazon / amazon.app.link /dp/
    │  └── MercadoLibreResolver  meli.la / articulo /p/ /up/ /social/ pdp_filters
    │  (otros) → unknown + fetch genérico allowlisted
    │
    ▼
fetch HTML (redirects seguros) + APIs retailer (ML /items|/products)
    │
    ▼
Product extract
    │  Amazon: og + DOM + colorImages / hiRes
    │  ML: API pictures + product-scoped JSON-LD + (social/meli.la) CDN HTML
    │  Resto MX: enrichRetailOfferFromHtml (JSON-LD Product → og/twitter)
    │
    ▼
Image policy
    │  selectOfferImages (dedupe, junk, ranking, max 8 publish / 24 candidates)
    │  mergeMercadoLibreImageCandidates (API ≥2 solo API; social CDN opcional)
    │
    ▼
classifyOfferExtraction           success | partial | failed
    │
    ▼
JSON preview → ActionBar draft → POST /api/offers
```

Separación obligatoria:

| Capa | Responsabilidad | No hace |
|------|-----------------|---------|
| **Resolver** | identidad canónica (ASIN, MLM, fingerprint) | scrapear precio |
| **Extractor** | título, precio, imágenes | inventar identidad |
| **Image policy** | dedupe / basura / orden / límites | confiar en “precio tachado” de tienda |
| **Classifier** | success / partial / failed para UX | publicar solo |

---

## 3. Qué devolvemos (contrato API)

`POST /api/parse-offer-url` (auth Bearer):

```ts
{
  title: string | null
  image: string | null          // portada
  images: string[]              // galería ordenada (máx OFFER_MAX_IMAGES)
  store: string | null
  suggested_discount_price: number | null
  suggested_original_price: number | null
  suggested_category: string | null
  reason: 'invalid_url' | 'extract_failed' | null
  extraction_status: 'success' | 'partial' | 'failed'
  missing: string[]             // p.ej. ['imágenes','precio']
  diagnostics?: object          // solo ops; sin secretos
}
```

| `extraction_status` | Significado UX |
|---------------------|----------------|
| `success` | Título + ≥1 imagen. Revisar y publicar. |
| `partial` | Hay señal útil pero falta pieza (típico: sin fotos). Completar a mano. |
| `failed` | No se identificó producto usable. |

Nunca mostrar “Listo” si `extraction_status === 'partial'` sin decir qué falta (`ActionBar`).

---

## 4. Matriz de capacidad (realidad actual)

| Retailer | Allowlist | Resolver identidad | Extractor rico | Galería multi | Notas |
|----------|-----------|--------------------|----------------|---------------|-------|
| **Amazon** (`.com.mx` + shorts) | ✅ | ✅ ASIN | ✅ HTML | ✅ colorImages/hiRes | `link.amazon` expand → `/dp/{ASIN}` |
| **Mercado Libre** | ✅ | ✅ item/catalog | ✅ API+HTML | ✅ | Social/`meli.la`: CDN HTML permitido |
| **Walmart MX** | ✅ | ✅ `/ip/{id}` → `wmt:` | ✅ JSON-LD + `__NEXT_DATA__` | ✅ | Short `walmart.page.link` |
| **Liverpool** | ✅ | ✅ PDP sku → `lvp:` | ✅ JSON-LD + sscdn | ✅ | Short `liverpool.app.link` |
| **Coppel** | ✅ | ✅ SKU path → `cpl:` | ✅ JSON-LD + CDN | ✅ | Short `coppel.app.link` |
| **Elektra** | ✅ | ✅ SKU path → `elk:` | ✅ JSON-LD + CDN | ✅ | elektra.mx / .com.mx |
| **Otros retail MX** (allowlist) | ✅ | ⚠ hostname | ✅ JSON-LD/og genérico | ⚠ 1–N vía JSON-LD | Home Depot, Costco, … |
| **AliExpress / Temu / Shein / eBay** | ✅ host | ⚠ | ⚠ genérico | ⚠ | Mismo path retail |
| **Dominio desconocido** | ❌ | — | — | — | `invalid_url` (correcto) |

Código de matriz (mantener alineado):  
`lib/offers/productExtraction/retailerCapabilities.ts`

### Hecho (P0 + P1)

- Amazon MX + Mercado Libre MX — full  
- Walmart MX + Liverpool + Coppel + Elektra — full (mismo molde Amazon)

### Siguiente

1. Home Depot / Costco — fixtures JSON-LD  
2. Nike/Adidas/Apple MX — deep-links app si fallan

---

## 5. Imágenes — reglas de oro

### 5.1 Orden de fuentes (por retailer)

**Amazon**

1. `og:image` / `#landingImage`  
2. JSON embebido `colorImages` / `hiRes` / `imageGalleryData`  
3. `#altImages`  
4. Dedupe por `amazonImageResourceId`

**Mercado Libre**

1. API `/items/{id}` pictures (+ variations)  
2. Si API ≥ 2 → **solo API** (no mezclar similares del HTML)  
3. Si API = 1 → API + mismo recurso + product-scoped (JSON-LD / `pictures[]`)  
4. Si API = 0 → og/twitter + product-scoped  
5. **Solo** `meli.la` o path `/social/`: permitir CDN HTML amplio (`allowHtmlCdnFallback`)  
   → ver `PARSE_OFFER_MELI_LA_GALERIA.md` (formatos `D_NQ_915700-…-OO.webp`)

**Retail MX genérico**

1. JSON-LD `Product.image` (array)  
2. `og:image` / `twitter:image`

### 5.2 Siempre

- Deduplicar por resource id (no por URL cruda)  
- Filtrar junk alta confianza (`aventaofertas.com`, sprites, 1x1, splinter)  
- Límite candidatos 24 → publish 8 (`OFFER_MAX_IMAGES`)  
- Portada = `images[0]`  

### 5.3 UI galería

- `OfferImageThumbs`: si `n > 4` → `+(n-4)` abre `OfferImageGallery`  
- Escape / click fuera / flechas / swipe  

---

## 6. Seguridad SSRF (no relajar)

Archivos: `lib/server/fetchUrlSafety.ts`, `lib/offers/commerceHostAllowlist.ts`

- Allowlist **exacta** de dominios registrados (no `includes('amazon')`)  
- Redirects hop-a-hop revalidados  
- Timeout + límite de hops  
- HTTP → upgrade a HTTPS cuando aplica  
- Nunca persistir `link.amazon` / short opaco como canónica de producto: expandir → marketplace `/dp/` o fail-closed  

---

## 7. Cómo añadir una tienda nueva (checklist perfecto)

No tocar el core con `if (url.includes('nike'))`.

### Paso A — Allowlist

1. Añadir dominio(s) + shortlinks oficiales en `commerceHostAllowlist.ts`  
2. Label en `inferStoreFromHostname.ts`  
3. Test en `tests/offers/mxCommerceAllowlist.test.ts` (o nuevo)

### Paso B — ¿Necesita Resolver propio?

| Caso | Acción |
|------|--------|
| JSON-LD Product basta | **No.** Cae en `enrichRetailOfferFromHtml` |
| Shortlinks / identidad SKU (ASIN, style-code) | Sí → `lib/offers/urlResolution/{retailer}Resolver.ts` + registrar en `detectProvider` |

### Paso C — Extractor de imágenes

1. Preferir JSON-LD / API oficial  
2. Selectores HTML solo como fallback documentado  
3. Tests con HTML fixture (mín. 0, 1, N imágenes, basura)

### Paso D — Capabilities + docs

1. Actualizar `retailerCapabilities.ts`  
2. Una fila en la matriz de este doc  
3. Test de contrato URL (identidad + no inventar id)

### Paso E — Validación

```bash
npx vitest run tests/offers/
npx tsc --noEmit
```

Manual: pegar URL real en Subir oferta → `extraction_status` + fotos + publish.

---

## 8. “¿Podemos abarcar más tiendas?”

**Sí — y ya hay base.**

Hoy el allowlist MX ya incluye Liverpool, Coppel, Walmart, Elektra, Home Depot, Nike, Adidas, Apple, Soriana, etc.  
Esas tiendas ya pasan por el **extractor genérico JSON-LD**.

Para “perfección” por tienda (galería completa, precio MSI, variantes):

1. Priorizar por volumen de hallazgos (Walmart → Liverpool → Coppel → Elektra)  
2. Añadir Resolver solo si hay shortlinks rotos o IDs propios  
3. Mejorar ImageStrategy solo con evidencias (fixtures), no con if/else de URLs sueltas  

Roadmap sugerido:

| Fase | Tiendas | Entrega |
|------|---------|---------|
| **P0** | Amazon + ML | Ya: identidad + galería + partial UX |
| **P1a** | Walmart + Liverpool | **Hecho:** resolver + extract multi-image |
| **P1b** | Coppel, Elektra | **Hecho:** mismo molde Amazon |
| **P2** | Home Depot, Costco | Idem |
| **P3** | Nike/Adidas/Apple MX | Resolver deep-links app si fallan |

---

## 9. Anti-regresión (lecciones ya pagadas)

| Incidente | Lección | Guardrail |
|-----------|---------|-----------|
| `meli.la` 1 foto | Regex CDN demasiado estricto | `D_[A-Za-z0-9_-]+` + test sin og |
| Contaminación similares ML | Mezclar HTML CDN en `/p/` | `allowHtmlCdnFallback` solo social/meli.la |
| `link.amazon` rechazo | Host ≠ `amazon.com` | Allowlist + expand genérico |
| “Listo” sin fotos | UX mentirosa | `extraction_status: partial` |
| Parches por URL | Inmantenible | Resolver por retailer, no por string |

---

## 10. Tests mínimos obligatorios

```bash
npx vitest run tests/offers/urlResolution.contract.test.ts
npx vitest run tests/offers/parseOfferPageHtml.test.ts
npx vitest run tests/offers/mergeMercadoLibreImageCandidates.test.ts
npx vitest run tests/offers/offerIngestArchitecture.test.ts
npx vitest run tests/offers/offerImageGallery.rules.test.ts
npx vitest run tests/offers/selectOfferImages.test.ts
```

Al tocar imágenes ML: **siempre** correr también el caso CDN `D_NQ_915700` sin meta og.

---

## 11. Definición de “hecho / a la perfección”

El sistema está “perfecto” para un retailer cuando:

1. Short + canónica + tracking + share resuelven la **misma** identidad  
2. Preview trae título + ≥1 imagen en casos sanos  
3. Fallos son `partial`/`failed` explícitos, no silencio  
4. No hay if/else de URLs de prueba  
5. Tests cubren identidad + imágenes 0/1/N + junk  
6. Allowlist + redirects no abren SSRF  
7. La matriz de capabilities refleja la verdad  

Amazon MX + Mercado Libre MX + **Walmart MX** + **Liverpool** + **Coppel** + **Elektra** cumplen full.  
El resto del allowlist está en **generic** (funciona si la tienda expone JSON-LD/og).  
**Siguiente:** Home Depot / Costco (mismo checklist de la sección 7).

---

## 12. Archivos clave (mapa)

| Archivo | Rol |
|---------|-----|
| `app/api/parse-offer-url/route.ts` | Orquestador HTTP |
| `lib/offers/urlResolution/*` | Resolvers Amazon/ML/Walmart/Liverpool/Coppel/Elektra |
| `lib/offers/commerceHostAllowlist.ts` | Dominios permitidos + expandable hops |
| `lib/offers/parseOfferPageHtml.ts` | HTML primitives + CDN ML/Amazon |
| `lib/offers/mergeMercadoLibreImageCandidates.ts` | Política galería ML |
| `lib/offers/selectOfferImages.ts` | Dedupe/ranking global |
| `lib/offers/mlPublicOffer.ts` | API ML |
| `lib/offers/enrichRetailOfferFromHtml.ts` | Retail MX genérico |
| `lib/offers/productExtraction/walmartExtract.ts` | Extractor Walmart full |
| `lib/offers/productExtraction/liverpoolExtract.ts` | Extractor Liverpool full |
| `lib/offers/productExtraction/coppelExtract.ts` | Extractor Coppel full |
| `lib/offers/productExtraction/elektraExtract.ts` | Extractor Elektra full |
| `lib/offers/productExtraction/classifyExtraction.ts` | success/partial/failed + UX tips |
| `lib/offers/productExtraction/retailerCapabilities.ts` | Matriz viva |
| `app/components/ActionBar.tsx` | UX parse |
| `app/components/OfferImageGallery.tsx` | Lightbox |
| `app/components/OfferImageThumbs.tsx` | `+N` |
