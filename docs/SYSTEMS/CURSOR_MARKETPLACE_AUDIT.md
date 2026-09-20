# AVENTA — CURSOR MARKETPLACE AUDIT

**Fecha:** 2026-09-20  
**Tipo:** investigación estratégica (sin instalación, sin cambios de arquitectura)  
**Audiencia:** Product + Architecture + Supply Intelligence  
**Principio:** LEVERAGE > cantidad de plugins. EXISTING AUTHORITY > NEW LOGIC.

---

## Executive Summary

El Cursor Marketplace **no contiene** un “PromoDescuentos killer”, un MCP de Mercado Libre oficial, ni un motor de Negative Memory listo.

Lo que sí ofrece son **capacidades de agente** (browser, scrape anti-bot, datos estructurados Amazon, docs, DB, observabilidad, seguridad) que pueden:

1. **acelerar investigación y PoCs** dentro de Cursor, y  
2. **opcionalmente** alimentar fuentes de evidencia **detrás** de la arquitectura Aventa.

**Conclusión dura:**

> Si Aventa quiere convertirse en infraestructura masiva de discovery, el leverage real **no** viene de instalar plugins. Viene de endurecer y orquestar lo que ya existe (workers, fingerprint, NM, category policies, DQE/S6.1/S8/S9, moderation loop) y usar Marketplace solo como **fuentes subordinadas / tooling de ingeniería**.

**Humo vs valor:**

| Humo | Valor real |
|---|---|
| “Instala un scraper y tendrás mejores ofertas” | Bright Data / Firecrawl / Apify como **inputs** con provenance |
| “Grok / voice bot buscará ofertas” | Grok Voice = STT/TTS de producto — **irrelevante** para discovery |
| “Un agent orchestration plugin reemplaza Caza” | Caza/S9 ya es la orquestación; plugins no publican |
| Supabase + Sentry + Vitest/Playwright en el agente | Debugging y calidad del sistema que sí escala |

**Respuesta a la pregunta operativa (“¿qué tienes tú que pueda usar Aventa ahora?”):**

En **esta sesión** ya hay:

- Browser MCP (`cursor-ide-browser`) + CDP — prototipar superficies, inspeccionar DOM/imágenes  
- Shell + Vitest + codebase — endurecer contratos  
- WebSearch / WebFetch — investigar superficies y competencia  
- Supabase / Vercel plugins (presentes, **requieren re-auth**) — métricas de recirculación y deploys  
- Cursor Automations (UI) — agentes programados para *auditoría / research*, no para mint de ofertas  
- Modelos de subagente (incl. Grok **como modelo de razonamiento**, no como crawler)

Eso **no** sustituye un worker de producción. Sirve para diseñar y validar la automatización senior **antes** de cablearla a `insertIngestedOffer`.

---

## Current Aventa Capabilities

Autoridades propias ya en operación / recently hardened (no reinventar):

| Capa | Autoridad Aventa |
|---|---|
| Discovery ML worker | `externalWorker` + mercadolibre-worker |
| Discovery ml_api / supply | S8 → S9 → S7 bridge |
| Write machine | `insertIngestedOffer` + machine write auth |
| URL | `normalizeOfferUrl` / `resolveOfferUrl` |
| Images ML | fail-closed item → variations → OG → `[]`; **nunca** galería `/products/{catalogId}` |
| Negative Memory | TTL 72h; SUPPRESS / PENALIZE / ALLOW; timeout ≠ spam; defense-in-depth en insert |
| Category intelligence | `categoryPolicies` soft-rank (perfume primero) |
| Diversity | shortlist diversity + source priors |
| Quality gates | Verifier, DQE, S6.1, S8, DealScore advisory |
| Moderation | TODAS / USUARIOS / BOT vía `created_by` |
| Product UX | OfferCard desc, expired consultable, sin disclosure spam en feed |
| Distribution | Caza / Telegram outbox (capa aparte) |
| Money | Economy / Rewards (capa aparte; no mezclar con discovery) |

**Implicación:** cualquier herramienta Marketplace debe mapearse a **fuente / telemetría / DX**, nunca a un segundo scorer ni a un segundo writer.

---

## Marketplace Categories Investigated

Categorías pedidas vs hallazgos (**Confirmado** = listado oficial / docs Cursor 2026):

| # | Categoría | Hallazgo Marketplace |
|---|---|---|
| 1 | Browser automation | Playwright, Browserbase, Browser Use, Chrome DevTools for Agents, Bright Data browser |
| 2 | Web scraping | Bright Data, Firecrawl, Apify, Browserbase |
| 3 | Playwright | Plugin oficial Cursor Playwright |
| 4 | Chromium / CDP | Chrome DevTools for Agents; Browser Use (CDP); ide-browser nativo |
| 5–8 | E-commerce / Amazon / ML / price tracking | **Amazon structured** vía Bright Data `bd-data`; **no MCP Mercado Libre**; no price-tracker dedicado |
| 9–11 | Product data / search / images | Firecrawl JSON agent; Bright Data SERP + scrape; HTML/CSS to Image (screenshots, no provenance) |
| 12–13 | CV / OCR | **No** plugin OCR/CV serio confirmado para product identity |
| 14 | Data extraction | Firecrawl agent, Apify, Bright Data |
| 15–17 | Postgres / Supabase / Redis | Supabase sí; Neon/Prisma irrelevantes; **Redis no** como capability discovery |
| 18 | GitHub | Integración **nativa** Cursor (Bugbot / Cloud Agents), no MCP listado |
| 19–21 | Testing / Vitest / Playwright | Playwright plugin; Vitest = tooling repo (no plugin crítico) |
| 22–24 | Observability / Sentry / logs | Sentry, Datadog (preview), Coralogix (relacionado) |
| 25 | Security | Semgrep |
| 26–28 | Deps / code quality / DB inspection | Sourcegraph; Supabase; Port (catálogo servicios) |
| 29–31 | AI agents / orchestration / workflows | Composio, AWS Agents, Artie, Cursor Automations (producto Cursor) |
| 32 | Cron / scheduling | Vercel plugin + crons Aventa; Automations Cursor (schedule de agentes) |
| 33 | HTTP/API | Postman |
| 34–35 | Docs / architecture | Context7, Notion, Figma, Port, Sourcegraph |

**Indirectamente relevantes:** Granola (reuniones), Linear (issues), Merge (enterprise connectors).

**No encontrados / no aplicables:** MCP Mercado Libre, price history SaaS, image similarity / visual dupes, Redis marketplace para NM.

---

## Discovery Opportunities

Pipeline conceptual Aventa:

`DISCOVERY → EXTRACTION → VALIDATION → RANKING → MODERATION → MEMORY`

| Etapa | Qué puede aportar Marketplace | Qué debe seguir siendo Aventa |
|---|---|---|
| Discovery de superficies | Bright Data SERP, Firecrawl search, Apify actors | Queries/categoría policies, seed strategy |
| Extraction | Unlocker / Firecrawl / Apify → HTML/JSON | Parsers canónicos, fingerprint, image provenance |
| Validation | nada que reemplace DQE/S6.1 | Gates existentes |
| Ranking | **nada** — no segundo scorer | Discovery Intelligence / DealScore advisory |
| Moderation | analytics vía Supabase/Sentry | claim filters, presets |
| Memory | métricas SQL | Negative Memory 72h |

**Clasificación A–F (síntesis):**

| Tool | Clase | Nota |
|---|---|---|
| Bright Data | **A** (condicional) | Unlocker + Amazon structured; fuente subordinada |
| Firecrawl | **B/A** sandbox | Extracción JSON con schema; PoC ML |
| Apify | **B** | Actors; lock-in store; útil research |
| Browserbase / Browser Use | **B** | Browser cloud / CDP para PoCs |
| Playwright plugin | **B** | DX sobre Playwright ya en repo |
| Supabase MCP | **A** engineering / **B** discovery analytics | Mide recirculación |
| Sentry | **A** ops | Fallos crawler/ingest |
| Context7 | **B** | Docs Next 16 |
| Semgrep | **B** | Security |
| Chrome DevTools Agents | **B** | UI/perf OfferCard |
| Composio / AWS Agents / Artie | **E/F** | Complejidad sin fit |
| Grok Voice | **F** | Voz de producto, cero discovery |
| Hunter / media plugins | **F** | Irrelevantes |

---

## Mercado Libre Opportunities

Problemas conocidos Aventa: recirculación, ml_api vs ml_worker tradeoff, PDP account-verification, imágenes catalog siblings, diversidad débil.

| Capacidad Marketplace | Fit ML | Riesgo |
|---|---|---|
| Bright Data Web Unlocker | **Alto** para desbloquear PDP/HTML cuando hay anti-bot (**inferencia**; PoC obligatorio) | ToS, coste, evidencia no-API |
| Firecrawl interact / agent | Medio — schema de precio/título/imágenes en sandbox | Alucinación de campos si no se fija schema + validación Aventa |
| Apify | Medio — si existe actor ML en Apify Store (**verificar por actor**, no asumir) | Dependencia Actor de terceros |
| Browser Use / Browserbase | Medio — sesiones browser para investigación | No escala a millones como path único |
| SERP Bright Data | Medio — descubrir queries/listados (“Lattafa oferta México”) | No es PDP verificado |

**Regla:** cualquier HTML/JSON externo → `RawObservation` / provenance → `resolveOfferUrl` → fingerprint → NM → gates.  
**Prohibido:** publicar desde plugin; usar `/products/{catalogId}` para imágenes.

---

## Amazon Opportunities

Amazon ya es más fuerte en imágenes/extracción en Aventa.

| Capacidad | Uso recomendado |
|---|---|
| Bright Data `bd-data` / structured Amazon | Comparar campos (precio, ASIN, imágenes) vs extractor propio en shadow mode |
| a.co resolution | Ya es autoridad Aventa — **no** reemplazar |
| Firecrawl | Solo si falta cobertura de página; validar ASIN |

**Objetivo ML “como Amazon”:** no copiar un plugin Amazon; copiar el **contrato de evidencia** (identidad item-bound + fail-closed) usando Unlocker/API propia como transporte.

---

## Image Extraction Opportunities

Autoridad Aventa (inviolable):

1. pictures del item  
2. variations del mismo item  
3. OG/Twitter confiables  
4. `[]`

Nunca galería catalog `/products/{catalogId}`.

| Tool | ¿Ayuda? | Clasificación |
|---|---|---|
| Browser CDP / DevTools / ide-browser | Inspeccionar DOM y validar `sourceItemId` en PoCs | **B** |
| Firecrawl / Bright scrape | Traer HTML; **Aventa** decide imágenes | **B** |
| HTML/CSS to Image | Screenshots marketing — **no** product identity | **F** para listing images |
| OCR / similarity plugins | **No confirmados** útiles | **F** / no inventar |

Ningún Marketplace tool debe convertirse en autoridad de imagen.

---

## Category Intelligence Opportunities

Perfume soft-rank ya existe (`PERFUME_DISCOVERY_POLICY`).

| Necesidad | Marketplace | Veredicto |
|---|---|---|
| Entity/brand extraction | Firecrawl schema / LLM en agente | Complementa **PoC**; producción = código Aventa |
| Taxonomy | No hay taxonomía retail MX lista | Extender `categoryPolicies` |
| Historical price | No hay plugin Price Memory | Price Memory Aventa + observations |
| Whitelist de marcas | **Nunca** vía plugin | Soft ranking only |

Clasificación: plugins de extracción = **C** para category intelligence; la extensión TECH/HOGAR = **código propio**.

---

## Moderation Intelligence Opportunities

Sin entrenar ML todavía:

| Pregunta | Cómo responder (preferido) |
|---|---|
| Approve/reject/spam rates por fuente | **Supabase SQL** + dashboards |
| Fingerprints que reaparecen | NM events + queries |
| Categorías que funcionan | offers + moderation_logs |
| Patrones de rechazo | `FOCUS_REJECTION_PRESETS` + classifyRejection |

Marketplace:

- Supabase MCP → **A** para construir esta inteligencia determinística  
- Sentry → errores de cola, no calidad de deal  
- Linear → tracking de hallazgos humanos  

**No** reemplazar Negative Memory con un SaaS de “memory”.

---

## Engineering Productivity

| Tool | Impacto Aventa |
|---|---|
| Context7 | Menos drift Next 16 / React 19 |
| Playwright plugin | Agente ejecuta regresiones OfferCard/moderation |
| Sourcegraph | Navegación en monorepo grande (**B/C** si no hay instancia) |
| Vercel plugin | Env/deploy/protected previews |
| Postman | Contratos API admin/ingest |
| Cursor Automations | Agentes cron: “auditar recirculación”, “diff staging”, **no** mint |

---

## Security

Aventa maneja afiliados, rewards, settlement → seguridad no opcional.

| Tool | Uso |
|---|---|
| Semgrep | SAST en money/auth/admin routes — **B/A** |
| GitHub native + Bugbot | Review de PRs densos |
| Supabase MCP | Auditar RLS **en read**; write peligroso |
| Postman security audit | Secundario |

**Riesgo Marketplace:** scrapers con API keys + acceso DB write = superficie de ataque. Preferir read-only y secretos en Vercel/env, no en chat.

---

## Observability

| Tool | Rol |
|---|---|
| Sentry | Excepciones ingest, parse-url, cron, UI |
| Datadog | Solo si ya es stack métricas |
| Logs Vercel | Ya en plataforma |

Discovery a escala necesita métricas **de producto** (approve rate, suppress rate, diversity) en Postgres — no solo APM.

---

## Top 5 Discovery Recommendations

1. **Bright Data** — Unlocker + SERP + Amazon structured → fuentes de evidencia bajo provenance Aventa.  
2. **Firecrawl** — PoCs de extracción estructurada ML con schema fijo + validación fail-closed.  
3. **Supabase MCP (read)** — medir recirculación, NM, approve rates ml_api vs ml_worker.  
4. **Browser Use / Browserbase / ide-browser** — investigación de superficies y anti-bot (lab).  
5. **Apify** — solo si un Actor concreto de ML/Amazon supera PoC frente a Bright/Firecrawl.

---

## Top 5 Engineering Recommendations

1. **Supabase MCP** (auth + read-first)  
2. **Sentry**  
3. **Chrome DevTools for Agents + Playwright plugin**  
4. **Context7**  
5. **Semgrep + Vercel plugin** (CI/security + staging loop)

---

## Top 5 Tools to Avoid

1. **Grok Voice** — voz; no discovery.  
2. **Composio / “1000 apps”** — ruido de tools + lock-in.  
3. **AWS Agents / Artie** — orquestación paralela a Caza/S9.  
4. **HTML/CSS to Image / media plugins** — no resuelven product identity.  
5. **Cualquier scraper como writer de `offers`** — bypasea NM/S9.1.

---

## Architecture Impact

### Decisiones por recomendación clave

#### Bright Data
1. ¿Entrar? **Sí, sandbox primero.**  
2. ¿Dónde? Capa de **acquisition/enrichment** pre-parser.  
3. ¿Reemplaza? No — complementa fetch cuando API/HTML falla.  
4. Dependencia: vendor + billing.  
5. Si desaparece: cae a API ML + workers propios.  
6. Self-hosted: no (SaaS).  
7. CI: smoke tests con mocks; no live Unlocker en CI.  
8. Escala: sí como API; coste lineal con volumen.  
9. Complejidad: +transporte, −bloqueo PDP si funciona.  
10. ROI: alto **solo** si desbloquea evidencia ML real sin inventar campos.

#### Firecrawl
1. Sandbox / research.  
2. Lab de schemas de extracción.  
3. Complementa parseOfferPageHtml; no lo reemplaza hasta paridad de tests.  
4–10. Similar a Bright con más sesgo “LLM extract” → mayor riesgo de campos inventados → validación estricta.

#### Supabase MCP
1. Sí (engineering).  
2. Agente Cursor + runbooks.  
3. Complementa SQL dashboards.  
4. OAuth proyecto.  
5. Si cae: `psql`/studio.  
6. N/A.  
7. CI: no necesario.  
8. N/A.  
9. Reduce trabajo humano de forensics.  
10. ROI alto inmediato para Supply Intelligence analytics.

#### Sentry
1. Sí si no está maduro.  
2. App + workers edge.  
3. Complementa logs.  
4. Vendor.  
5. Fallback logs.  
7. CI opcional.  
10. ROI alto en MTTR ingest.

---

## Dependency / Lock-in Analysis

| Capacidad | Lock-in | Mitigación |
|---|---|---|
| Bright Data / Firecrawl / Apify | Alto en transporte | Interface `FetchEvidence(url) → RawObservation`; swap vendor |
| Supabase MCP | Bajo (DX) | SQL portable |
| Sentry | Medio | OpenTelemetry posible a futuro |
| Cursor Automations | Medio (proceso) | Documentar prompts; lógica en repo |
| Composio | Muy alto | Evitar |

**Regla de oro:** el **contrato de evidencia y write path** nunca viven dentro del plugin.

---

## Recommended Adoption Roadmap

### NOW (sin instalar scrapers en prod)
- Autenticar **Supabase MCP** (read) y medir: suppress rate, recirculación fingerprint, approve rate por `ingest_source`.  
- Usar **ide-browser + Playwright repo** para PoCs de DOM/imagen ML.  
- Definir interfaz `EvidenceProvider` en diseño (doc/ADR) antes de cablear vendor.  
- **No** bajar thresholds para “competir” en volumen.

### NEXT
- PoC **Bright Data Unlocker** en 10 URLs ML que hoy fallan account-verification.  
- PoC **Firecrawl** schema perfume (Lattafa…Paris Corner) → comparar contra `classifyBotCategory` + perfume policy.  
- Shadow: Amazon structured Bright vs extractor Aventa (paridad imágenes/precio).  
- Instalar **Sentry** + **Context7** + **Semgrep** para DX/seguridad.

### LATER
- Un solo vendor de web-data en producción detrás de `EvidenceProvider`, con budget y canary.  
- Cursor Automations: job semanal “recirculation report” + “perfume surface SERP research”.  
- Apify solo si gana head-to-head en coste/calidad.

### NEVER
- Plugin como `insertIngestedOffer`.  
- Segundo scorer global.  
- Whitelist rígida de marcas perfume.  
- Galería `/products` para imágenes.  
- Grok Voice / Composio / orquestadores cloud como Supply Engine.  
- Bajar quality gates para igualar volumen de PromoDescuentos.

---

## Capacidades YA disponibles en esta sesión (sin Marketplace nuevo)

Esto responde: *“¿qué tienes tú que pueda utilizar para Aventa?”*

| Capacidad actual | Uso senior para discovery de calidad |
|---|---|
| **cursor-ide-browser** | Navegar ML/Amazon, snapshot DOM, screenshots, validar que la imagen pertenece al item |
| **Shell + Vitest** | Contratos URL/imagen/NM; canaries de regresión |
| **WebSearch / WebFetch** | Mapear superficies competidoras y queries de categoría |
| **Codebase + ADRs** | Extender policies sin romper autoridades |
| **Supabase plugin** | Tras `mcp_auth`: queries de spam/recirculación/approve |
| **Vercel plugin** | Tras auth: logs/deploys staging canary |
| **Cursor Automations** | Agente programado: *research + reporte*, nunca mint |
| **Subagentes / modelos (incl. Grok)** | Razonar/planear/revisar código — **no crawlear producción** |
| **Grok Voice (Marketplace)** | **No usar** para ofertas |

### Automatización “nivel senior” para competir con PromoDescuentos

PromoDescuentos gana con **volumen editorial + velocidad + confianza percibida**. Aventa debe ganar con:

**DEAL PRECISION > VOLUME** + diversidad + evidencia + memory.

Arquitectura objetivo (sin plugins como cerebro):

```
Surface discovery (SERP / seeds / category policies)
    → Evidence fetch (API ML | Unlocker | Amazon structured)  [vendor opcional]
    → normalizeOfferUrl / resolveOfferUrl
    → product fingerprint + image provenance (fail-closed)
    → price / availability evidence (no inventar)
    → Negative Memory (SUPPRESS/PENALIZE)
    → category soft-rank × diversity × source quality
    → DQE / S6.1 / S8 / S9
    → pending moderation (BOT filter)
    → publish → Price Memory / feedback → NM
```

**Lo que falta no es un bot Grok.** Falta:

1. **Más superficies de calidad** (perfume, tech) con seeds medibles.  
2. **Transporte anti-block** controlado (PoC Bright/Firecrawl).  
3. **Telemetría de calidad** (Supabase): qué se aprueba/rechaza por fuente.  
4. **Cerrar el loop** moderation → NM (ya encaminado) con dashboards semanales.  
5. **Human-in-the-loop** eficiente (BOT/USER), no más spam en cola.

---

## Final Recommendation

> **Si Aventa quiere ser una plataforma masiva de discovery de ofertas, del Cursor Marketplace vale la pena incorporar —con gobernanza— Bright Data (y/o Firecrawl) como transporte de evidencia, Supabase/Sentry/Semgrep/Context7/Playwright-DevTools como leverage de ingeniería, y casi nada más. El resto es humo o duplica Caza/S9/NM.**

**Competir con PromoDescuentos no se resuelve instalando un plugin.**  
Se resuelve haciendo que cada candidato que llega a moderación sea **más nuevo, más diverso, mejor evidenciado y menos spam** — exactamente la dirección de Precision > Volume que ya estáis construyendo.

**Próximo paso recomendado (cuando autorices implementación, no ahora):**

1. Auth Supabase read → reporte de recirculación real.  
2. PoC Unlocker en URLs ML bloqueadas (10 casos) con scorecard vs API.  
3. Diseñar `EvidenceProvider` + canary budget.  
4. Solo entonces cablear a staging detrás de NM/S9.1.

---

## Appendix — Evidence legend

- **Confirmado:** listado cursor.com/marketplace o docs Cursor MCP guide (2026).  
- **Inferencia:** encaje Aventa plausible; requiere PoC.  
- **Futuro posible:** útil solo tras gobernanza y métricas.

## Appendix — Explicit non-actions of this document

No se instaló plugin/MCP.  
No se modificó discovery, NM, Caza, Economy ni DB.  
No se hizo commit/push/deploy por este informe.
