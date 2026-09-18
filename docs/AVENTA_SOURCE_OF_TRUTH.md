# AVENTA — SOURCE OF TRUTH

> **Versión:** V1  
> **Fecha de corte:** 2026-09-14  
> **Alcance:** estado REAL de código + señales de producción observadas  
> **Precedencia:** código + esquema + flags + producción **>** documentación histórica

---

## 1. Propósito

Este documento es la **Source of Truth canónica** del estado actual de Aventa.

Responde qué sistemas existen, cuáles operan en producción, cuáles están incompletos, apagados a propósito, o solo viven en docs.

**Regla absoluta:** si un documento histórico contradice este archivo, **este archivo gana** hasta que se actualice con evidencia nueva de código/producción.

No describe roadmap como si fuera estado. No inventa arquitectura. No asume features por docs viejas.

---

## 2. Estado actual de Aventa

Fotografía ejecutiva (Aventa entrando a **1.0**):

| Dominio | Estado | Lectura corta |
|---------|--------|---------------|
| Producto core (feed, oferta, votos, comentarios, publicar, perfiles) | 🟢 | Loop usuario funciona |
| Supply (descubrimiento → pending) | 🟡 | ML Worker vivo; yield/calidad limitados; ML API 403 |
| Hunter | 🟢 | Engine + panel + health; módulos no-ML parciales/OFF |
| Moderación | 🟢 | Cola humana operativa; es el cuello principal |
| Publicación | 🟠 | Todo a `pending` en prod; docs/UX a veces prometen auto-approve |
| Monetización | 🟡 | Código dual Rewards/Commissions + ledger; **OFF / freeze** en prod |
| Autonomía | 🟢 (shadow) / ⚪ (live) | Observa y recomienda; **no publica** |
| Operaciones | 🟡 | CI/cron/admin OK; migraciones/staging/backups incompletos |
| UX | 🟢 | Journeys críticos cableados; liquidez de approved estrecha |
| Observabilidad | 🟡 | Supply Truth + shadow + hunter health; parte en memoria de isolate |

**Veredicto:** el núcleo de producto está listo para usarse; el negocio 1.0 está bloqueado por **liquidez de ofertas aprobadas de calidad**, no por falta de pantallas.

---

## 3. Arquitectura actual

Flujos **reales** (no aspiracionales):

### 3.1 Consumo

```text
Usuario
  → Home (/) tabs feed (Día a día / Top / Para ti / Recientes)
  → búsqueda cliente (ilike) o listado API feed
  → tarjeta / detalle (/oferta/[id])
  → CTA outbound (track-outbound / offer_events)
  → tienda afiliada (si hay tags de plataforma)
```

### 3.2 Publicación comunitaria

```text
Usuario autenticado
  → /subir o ActionBar
  → parse URL / imagen / API POST /api/offers
  → status = pending   ← siempre (communityPersistStatus)
  → moderación humana (/admin/moderation)
  → approved | rejected
  → si approved → feed
```

### 3.3 Supply máquina (camino productivo)

```text
ML Worker (GitHub Actions, Playwright)
  → POST /api/cron/bot-ingest-candidates (externalWorker)
  → enrichment / images / score / verifier
  → dedupe (URL + product_fingerprint + timeout_cooldown)
  → insert offers status=pending   ← no approved en prod
  → moderación humana
  → approved → feed
```

Camino paralelo / observación:

```text
Hunter collect / Supply Router
  → discovery aislado por source
  → qualification + shadow Decision Engine
  → persist snapshots / hunter_supply_runs   ← NO inserta ofertas
```

Ingest cron clásico:

```text
cron externo → /api/cron/bot-ingest → runIngestCycle
  → fuentes (ml_api_legacy, etc.)
  → en cloud ML API suele 403 → 0 candidatos
  → si hay candidatos: mismo destino pending (auto-approve write OFF en prod)
```

### 3.4 Eventos / dinero (cuando flags lo permitan)

```text
Outbound click
  → offer_events (+ reward_outbound_clicks si aplica)
  → attribution (Commissions y/o Rewards)
  → ledger import / settlements
  → payouts SPEI manual
```

En producción actual: tracking **sí**; liquidación **no** (programas OFF + `MONEY_PATH_FROZEN` fail-closed).

---

## 4. Inventario de sistemas

Leyenda: 🟢 operativo · 🟡 incompleto · 🟠 desalineado · 🔴 solo docs · ⚪ no existe

| Sistema | Estado | Código principal | Producción | Dependencias | Observaciones |
|---------|--------|------------------|------------|--------------|---------------|
| **PRODUCTO** | | | | | |
| Home/feed | 🟢 | `app/page.tsx`, `app/api/feed/home`, `lib/offers/feedService.ts` | Sí | vista ranking / offers | Tabs Día a día / Top / Para ti / Recientes |
| Search | 🟡 | búsqueda en `app/page.tsx` | Sí (parcial) | Supabase client | Sin API dedicada de search |
| Offer detail | 🟢 | `app/oferta/[id]/page.tsx` | Sí | offers | |
| Categories | 🟢 | `app/categoria/**` | Sí | | |
| Stores | 🟢 | `app/tienda/[slug]/page.tsx` | Sí | | |
| Votes | 🟢 | `app/api/votes` | Sí | triggers SQL | |
| Comments | 🟢 | `app/api/offers/[offerId]/comments/**` | Sí | tabla `comments` | Docs a veces dicen `offer_comments` |
| Profiles | 🟢 | `app/u/[username]`, `app/me` | Sí | reputation | |
| Notifications | 🟢 | `app/api/notifications/**`, Navbar | Sí | Resend opcional digests | |
| Onboarding | 🟢 | OnboardingV1 → Para ti | Sí | prefs | |
| Plaza/Requests | 🟡 | `app/plaza`, `app/api/plaza/**` | UI viva; uso ~0 | tablas plaza | Sin loop respuestas→oferta |
| Communities | 🟠/🔴 | redirect en `next.config.ts` | Redirect a `/` | — | Docs aún las describen |
| **SUPPLY** | | | | | |
| ML Worker | 🟢 | `workers/mercadolibre-worker/`, GHA workflow | Sí (cada ~30m) | `AVENTA_CRON_SECRET` | Camino B real |
| ML API legacy | 🟡 | `discoverMercadoLibre`, `ml_api_legacy` | Corre; descubre 0 | API ML pública | 403 PolicyAgent en cloud |
| Hunter | 🟢 | `lib/hunter/engine.ts`, `/admin/hunter` | Sí | sources registry | |
| Supply Engine / Router | 🟡 | `lib/hunter/supply/router.ts` | Observa / Truth | | `persist` siempre false |
| Supply Truth | 🟢 | `getSupplyTruth`, `hunter_supply_runs` | Sí | DB | |
| Dedupe | 🟢 | `lib/offers/findDuplicateOffer.ts` | Sí | fingerprints | Incluye `timeout_cooldown` |
| Qualification | 🟢 | `lib/hunter/dealQualification/*` | Sí (métricas) | Price Intel | No es “Quality Engine” formal |
| Image enrichment | 🟢 | enrichment ML + merge candidates | Sí | | |
| Price Memory (product) | 🟢 | `product_price_snapshots`, mlPriceEngine | Sí (~miles filas) | | |
| Price Memory (offer) | 🟡 | `offer_price_snapshots` | Casi vacío | | |
| Día a Día (retailers) | 🟡 | `lib/hunter/dayToDay/*` | OFF | flags DAY_TO_DAY_* | |
| Amazon | 🟡 | sources amazon* | OFF / sin creds | | |
| Keepa | 🟡 | `keepa.ts` | OFF | Amazon | |
| Top Deals (motor supply) | ⚪ | — | — | | Tab “Top” = ranking votos, no motor |
| **AUTONOMY** | | | | | |
| Decision Engine | 🟢 | `lib/autonomous/decide.ts` | Shadow | | |
| Shadow | 🟢 | observe + cycles DB | Sí | | 0 AUTO_APPROVE productivo |
| Auto-reject (productivo write) | 🟡 | scoring/timeout paths | Parcial | | Timeout/cooldown sí; no autonomía live plena |
| Auto-approve (write) | 🟠 | `legacyAutoApproveWriteEnabled` | **OFF hard en prod** | | Docs viejas mienten |
| Moderation | 🟢 | `/admin/moderation/**` | Sí | | Cuello P0 |
| Calibration | 🟢 | `lib/autonomous/calibration/*` | Observa | | No cambia policy sola |
| Exception handling | 🟢 | circuitBreaker, try/catch sources | Sí | | |
| Agents (Copy/Coupon/Bank) | 🟡/🔴 | copy parcial; coupon/bank planned | No productivos | | |
| **MONEY** | | | | | |
| Outbound | 🟢 | track-outbound, offer_events | Sí | write queue | |
| Attribution | 🟡 | `lib/commissions/*`, `lib/rewards/attribution/*`, `lib/attribution/*` | Tracking sí; settle no | flags | Dual engines + Attribution Foundation |
| Conversion + Commission Foundation | 🟢 | `lib/economy/**`, `affiliate_conversions` / `affiliate_commissions` | Foundation only — **no ingest live** | — | NO liquida; revenue not connected |
| Affiliate tags | 🟢 | `lib/affiliate/*` | Depende env | AMAZON_*/ML_* | |
| Commissions | 🟡 | `lib/commissions/**` | OFF | COMMISSION_PROGRAM_ACTIVE | UI `/me` no monta panel; legacy ≠ network SoT |
| Rewards | 🟡 | `lib/rewards/**`, `/me` panels | OFF | REWARDS_PROGRAM_ACTIVE | |
| Ledger | 🟢 | admin affiliate-ledger, processLedger | Ops manual | | Maestro §7.1 obsoleto |
| Payouts | 🟡 | rewards payout SPEI manual | Gated | freeze | |
| Owner economy | 🟢 | `lib/owner/estimatedEconomy.ts` | Sí (estimado) | ledger+clicks | |
| **OPS** | | | | | |
| Cron (Vercel) | 🟢 | `vercel.json` | Sí | | Digests, integrity, health, write-queue, rewards-holds, ml-oauth |
| Worker scheduler | 🟢 | `.github/workflows/mercadolibre-worker.yml` | Sí | cron `7,37` | |
| Health | 🟢 | hunter-health, offer-health, integrity | Sí | | |
| Alerts | 🟡 | SYSTEM_ALERT_*, Resend, webhooks | Depende env | | NO VERIFICADO cableado prod en este doc |
| Observability | 🟡 | metricUniverses, Supply Truth | Parcial | | Memory metrics por isolate |
| CI/CD | 🟢 | `.github/workflows/ci.yml` | Sí | | |
| Migrations | 🟡 | `docs/supabase-migrations/` | Aplicadas a mano | | `supabase/migrations/` vacío |
| Backups | 🔴 | checklists | Sin pipeline repo | Supabase | |
| Staging | 🟡 | `oojshofrpbfwsiypcecr` (legacy→staging) | Contract + guards; local still often on prod until founder rekeys | `STAGING_ENVIRONMENT_CONTRACT.md` | Preview env TBD in Vercel |
| Security | 🟡 | middleware, cron Bearer, RLS | Sí con WARN advisors | | |
| **UX** | | | | | |
| Desktop | 🟢 | home + detalle | Sí | | |
| Mobile | 🟢 | ActionBar 2 pasos | Sí | | |
| Critical journeys | 🟡 | feed→cazar; subir; moderar | Sí pero liquidez baja | | |
| Empty states | 🟢 | EmptyState | Sí | | |
| Error handling | 🟢 | error.tsx, toasts | Sí | | |
| Admin moderation UX | 🟢 | moderation cards/OS | Sí | | |

---

## 5. Supply Truth

### 5.1 Quién hace qué

| Pregunta | Respuesta real |
|----------|----------------|
| ¿Quién descubre? | **ML Worker** (productivo). También `runIngestCycle` sources (ML API suele fallar). Día a Día/Amazon OFF. Comunidad via submit usuario. |
| ¿Quién califica? | `dealQualification` + Deal Verifier en pipelines Hunter/ingest; métricas VERIFIED/PROMOTION/catalog-only |
| ¿Quién deduplica? | `findDuplicateOffer` (+ dedupe candidatos Hunter/Supply) |
| ¿Quién persiste ofertas? | `externalWorker` (candidates) y `runIngestCycle` (ingest). Community via `/api/offers`. |
| ¿Quién publica (approved)? | **Humano** en moderación. En prod no hay write-approve del bot. |
| ¿Quién NO publica? | Supply Router, Decision Engine shadow, Qualification sola, Price Intel sola |

### 5.2 Duplicidad arquitectónica (real)

Existen **dos caminos** que no deben confundirse:

1. **Persistencia de ofertas:** `externalWorker` / `runIngestCycle` → tabla `offers`
2. **Orquestación / Truth:** Supply Router → reportes/`hunter_supply_runs` **sin insert**

El router **no** es una segunda verdad de persistencia. Si se unifica en el futuro, debe ser cambio explícito de código — hoy no lo es.

### 5.3 Fuentes

| Fuente | Rol | Prod |
|--------|-----|------|
| `ml_worker` | Descubrimiento Playwright → pending | Activa |
| `ml_api_legacy` | API pública ML | Código vivo; **403**; yield 0 |
| community | Usuario sube URL | Activa → pending |
| Día a Día retailers | Adapters | Flags OFF |
| Amazon / Keepa / env_urls | Opcionales | OFF / no configurado |
| affiliate_feed / partner | Registry | NOT_CONFIGURED |

### 5.4 Docs canónicos de supply (alineados)

- `docs/hunter/supply-orchestration.md`
- `docs/hunter/day-to-day-sources.md`
- Sección estado FASE 10.1 en `docs/SISTEMA_SUBIR_OFERTA.md`

---

## 6. Moderation Truth

### 6.1 Estados de oferta (operativos)

- `pending` — cola humana (destino por defecto de comunidad y bots en prod)
- `approved` — visible en feed (según reglas de expiración/ranking)
- `rejected` — fuera de feed; puede entrar en cooldown de recirculación

Otros campos/meta (`bot_meta`, reasons, locks, snooze) apoyan la cola; la publicación productiva es humana.

### 6.2 Automatización permitida hoy

| Acción | Estado |
|--------|--------|
| Insertar como `pending` | Sí |
| Shadow AUTO_APPROVE / AUTO_REJECT (solo observación) | Sí |
| Auto-reject por timeout + anti-recirc `timeout_cooldown` | Sí (dedupe) |
| Escribir `approved` desde bot en producción | **No** (`legacyAutoApproveWriteEnabled = optIn && !production`) |
| Auto-approve comunidad por reputación | **No** (`communityPersistStatus` → siempre `pending`) |

### 6.3 Deliberadamente apagado

- Auto-publish / legacy auto-approve write en producción
- Autonomía live (Decision Engine no escribe status aprobado)
- Cualquier narrativa de “reputación ≥ N aprueba al instante” como comportamiento prod

### 6.4 Cola

La moderación humana es el **cuello P0**: pending alto frente a approved bajo (observado en prod alrededor de cientos pending / decenas approved — cifras exactas cambian; ver panel hunter/moderation).

---

## 7. Quality Truth

Mecanismos **existentes** (no un score único formal):

| Mecanismo | Qué hace |
|-----------|----------|
| Deal Qualification | `VERIFIED_DEAL` / `PROMOTION` / `NO_VERIFIED_DEAL` (catalog-only) |
| Deal Verifier / score ingest | Señales + umbrales bot |
| Effective discount | Descuento efectivo vs lista artificial |
| Price Intel / Price Memory | Historial `product_price_snapshots`; **no** fabrica VERIFIED solo |
| Artificial list price | Señales anti “lista inventada” |
| Duplicate detection | URL + fingerprint + cooldown timeout |
| Source provenance | `source` / bot_meta / supply family |
| Images | Enrichment + validación imagen oferta |
| Availability / store | Meta por fuente (calidad variable) |
| Historical price | Product-level madurando; offer-level incompleto |
| Potential vs verified | Contadores Supply Truth (`potential_deals`, `verified`, `catalog_only`) |

**Quality Engine formal V1 — existe** en `lib/hunter/dealQuality/` (orquesta qualification + Price Memory + dedupe + imagen; no publica; no score 0–100).  
Sigue pendiente: calibración con outcomes humanos y priorización de cola de moderación basada en `recommendedAction`.

---

## 8. Monetization Truth

### IMPLEMENTADO (código)

- Outbound / `offer_events` / write queue
- Affiliate tag application al guardar/aprobar/ingest
- Attribution dual: Commissions (`lib/commissions`) + Rewards (`lib/rewards`)
- Ledger admin + processLedger Rewards
- Payouts SPEI manual (RPC rewards)
- Owner estimated economy
- Kill-switch `MONEY_PATH_FROZEN`

### ACTIVO EN PRODUCCIÓN (comportamiento)

| Pieza | ¿Activo? |
|-------|----------|
| Registrar clicks/outbound | Sí |
| Aplicar tags si env configurado | Sí (si credenciales presentes) |
| Crear rewards / liquidar comisiones | **No** (flags OFF) |
| Mover dinero / payouts | **No** (freeze fail-closed en prod si ausente/inválido) |

**No confundir:** “hay UI de recompensas en `/me`” ≠ “el programa paga”.

Hold/política: Rewards V1 usa hold largo (config ~60d); política histórica de comisiones habla 14d — dualidad documentada, no unificar en silencio.

---

## 9. Autonomy Truth

```text
CURRENT (prod)
  → humano aprueba/rechaza
  → bot solo inserta pending
  → shadow registra qué haría el Decision Engine

SHADOW (activo)
  → decideAutonomous: AUTO_APPROVE | HUMAN_REVIEW | AUTO_REJECT
  → calibration mide agreement; no cambia policy

SEMI-AUTO (no activo)
  → futuro seguro: AUTO_REJECT de basura/dup con audit
  → AUTO_APPROVE estrecho solo tras evidencia

AUTONOMOUS (no activo)
  → publish sin humano — prohibido hasta liquidez + agreement + checklist
```

| Tipo de decisión | Hoy |
|------------------|-----|
| Descubrir / enriquecer / dedupe | Máquina |
| Persistir pending | Máquina |
| Publicar approved | Humano |
| Pagar | Apagado |
| Aprender policy sola | No existe |

---

## 10. Production Flags

No se listan secretos ni valores. Solo nombres y semántica.

| Flag | Estado típico prod | Función | Riesgo |
|------|--------------------|---------|--------|
| `BOT_INGEST_AUTO_APPROVE` | Irrelevante para write | Opt-in legacy; **write bloqueado en prod aunque sea 1** | Confusión ops |
| `legacyAutoApproveWriteEnabled` | false (derivado) | Único permiso de escribir approved desde bot | Reactivar requiere **cambio de código** |
| `REWARDS_PROGRAM_ACTIVE` | OFF (fail-closed) | Única llave Rewards | Encender sin legal/liquidez |
| `COMMISSION_PROGRAM_ACTIVE` | OFF | Programa legacy comisiones | No activa Rewards |
| `MONEY_PATH_FROZEN` | Fail-closed ON si ausente en prod | Kill-switch money | Descongelar sin checklist |
| `DAY_TO_DAY_*_ENABLED` | OFF | Retailers Día a Día | Anti-bot / compliance |
| `DAY_TO_DAY_PILOT` / `FIXTURES` | OFF salvo pruebas | Pilot/fixtures | Contaminar prod |
| Credenciales Amazon/ML affiliate | NO VERIFICADO aquí | Tags comisión | URLs sin ingreso si faltan |
| `AVENTA_CRON_SECRET` / Bearer cron | Requerido | Auth crons/worker | Worker cae si inválido |
| `SYSTEM_ALERT_*` / Resend | NO VERIFICADO cableado | Alertas CEO | Ops ciegas si faltan |

---

## 11. Documentation Drift

| Documento | Estado | Contradicción | Fuente correcta |
|-----------|--------|---------------|-----------------|
| `docs/COMUNIDADES_IMPLEMENTACION.md` | 🟠 | Describe `/communities` y `community_id` vivos | `next.config.ts` redirects; ActionBar → Plaza |
| `docs/FASE2_COMUNIDAD_SOLICITUDES.md` | 🟠 | Dice no implementado | Plaza existe (`app/plaza`) |
| `docs/SYSTEMS/SYSTEM_comments.md` | 🟠 | Tabla `offer_comments` | Código: `comments` |
| `docs/SYSTEMS/SYSTEM_profiles.md` | 🟠 | `app/profile/[username]` | `app/u/[username]` |
| `docs/SYSTEMS/SYSTEM_moderation.md` (+ upload/profiles/PRD) | 🟠 | Auto-approve reputación ≥3 | `communityPersistStatus` → pending |
| `docs/DOCUMENTO_MAESTRO_AVENTA.md` §7.1 | 🟠 | “No hay ledger” | Admin ledger + Rewards ledger |
| `docs/LAUNCH_CHECKLIST.md` (fallback Commission→Rewards) | 🟠 | Legacy flag activaría Rewards | `lib/rewards/programStatus.ts` solo `REWARDS_*` |
| `docs/HUNTER_INFRA_Y_ROADMAP.md` | 🟠 | Railway como Camino B principal | GHA `mercadolibre-worker.yml` |
| `docs/BOT_MODO_SOLO_MODERACION.md` | 🟠 | Implica toggle; Price Memory “no” | Hard-off prod; snapshots ML existen |
| `docs/SISTEMAS_AVENTA.md` | 🟠 | Mapa pre FASE 8–11 | Este SoT + `docs/hunter/*` |
| `docs/README.md` (histórico) | 🟠 | Índice sin SoT/hunter | Actualizado para apuntar aquí |
| `.env.example` comentarios | 🟠 | Auto-approve / `?secret=` query | Código: Bearer; write-approve OFF prod |
| Política comisiones vs Rewards hold | 🟠 | 14d vs ~60d | Tratar como dual hasta unificar |

---

## 12. Zombie Systems

| Ítem | Clasificación |
|------|----------------|
| `/communities`, `/admin/communities` | **dead** (redirect) |
| Docs de gremios como feature viva | **deprecated** (docs) |
| Auto-approve reputación en docs SYSTEM_* | **legacy / false** |
| ML API como fuente confiable | **intentionally degraded** (403) |
| Supply Router como publisher | **planned misuse** — hoy dry-run correcto |
| Coupon/Bank agents | **planned** |
| Día a Día / Amazon / Keepa | **intentionally disabled** |
| Commissions UI en `/me` | **legacy orphan** (código admin sí) |
| Rewards UI con programa OFF | **implemented / disabled** |
| Top Deals como motor supply | **does not exist** |
| `supabase/migrations/` vacío | **process gap** (SQL vive en `docs/supabase-migrations/`) |
| Railway Camino B en docs | **obsolete narrative** |

No borrar: solo no usar como SoT.

---

## 13. Aventa 1.0 — Definition of Done

Enfoque en dos loops:

**Demanda:** SEARCH/FIND → GOOD DEAL → TRUST → OPEN → BUY  
**Oferta:** SUBMIT/DISCOVER → VERIFY → MODERATE → PUBLISH

### Producto
- Feed con densidad usable de `approved`
- Detalle, votos, comentarios, perfiles, notificaciones estables
- Subir oferta con copy honesto (“pasa a moderación”)

### Supply
- ML Worker estable insertando candidatos con imagen y menos basura
- Dedupe/cooldown evitando recirculación
- Supply Truth legible para CEO (una narrativa: quién inserta vs quién observa)

### Quality
- Qualification + señales suficientes para priorizar cola
- Menos catalog-only en pending
- (Quality Engine formal sigue pendiente; no bloquea 1.0 mínimo)

### Moderation
- Cola drenable en tiempo humano realista
- Locks/snooze/reportes operativos

### Publication
- Solo humanos (o semi-auto explícito futuro) escriben `approved`
- Cero auto-approve silencioso

### Monetization
- Tags + outbound correctos
- Ledger importable
- Programas pueden permanecer OFF en 1.0 lanzamiento si el checklist legal no está listo — pero el path no debe estar roto

### Reliability
- CI verde; worker GHA verde; crons auth OK
- Migraciones rastreables repo↔prod

### UX
- Mobile/desktop journeys sin callejones (`/communities`)
- Empty/error honestos

### Autonomy
- Shadow + calibration vivos
- Live autonomy **no** es requisito de 1.0

---

## 14. Current Bottlenecks

Máximo 10; orden por impacto:

1. **Liquidez `approved`** — poca oferta publicada vs pending/rejected  
2. **Calidad de candidatos ML** — catalog-only / lista artificial / dups  
3. **Throughput de moderación humana** — único publisher  
4. **Doble camino supply** (router Truth vs ingest persist) — confusión operativa  
5. **ML API cron vacío (403)** — ruido y falsa sensación de supply  
6. **Docs drift** — decisiones CEO sobre mundos muertos  
7. **Money OFF + dual engines** — sin loop económico; riesgo de activación incorrecta  
8. **Disciplina de migraciones** — drift schema  
9. **Plaza zombie** — UI sin loop ni liquidez  
10. **Observabilidad parcial** (métricas en memoria / health `last_run_at` inconsistente)  

---

## 15. What NOT To Build Yet

- Autonomía live / auto-publish productivo  
- Encender Rewards/Commissions sin liquidez + legal + freeze explícito  
- Gremios / comunidades in-app  
- Coupon/Bank agents  
- Día a Día retailers sin compliance  
- Amazon/Keepa sin ROI y credenciales  
- Gamificación / misiones formales  
- Search “ideal” antes de feed con deals buenos  
- PSP/SPEI automático  
- Quality Engine formal completo antes de drenar cola con señales actuales  

---

## 16. Roadmap

### P0 — Liquidity & Quality
- Mejorar yield ML (menos junk, más deal real, imágenes)  
- Drenar / priorizar cola moderación  
- Alinear docs/UX con pending + money OFF  
- Disciplina migraciones  

### P1 — Controlled Autonomy
- AUTO_REJECT seguro productivo (dup/timeout/junk) con audit  
- Subir agreement shadow↔humano  
- **No** AUTO_APPROVE amplio  

### P1 — Monetization
- Verificar tags en prod  
- Ledger ops rutinario  
- Checklist legal → flags (después de liquidez)  

### P2 — Search & Requests
- API search unificada  
- Plaza: cerrar loop o ocultar  

### P2 — Multi-source Supply
- Día a Día / Amazon solo con compliance  

### P2 — Advanced Product
- Quality Engine formal  
- Gamificación  
- Comunidades (solo si hay tesis nueva)  

---

## 17. Dependency Graph

```text
Quality (señales + qualification + dedupe)
  → Moderation throughput
    → Approved liquidity
      → Feed usable
        → Trust + CTR (outbound)
          → Monetization (solo si flags ON)
            → Calibration data
              → Controlled autonomy

ML Worker health ──► pending supply ──► (misma cola)

Supply Router / Shadow ──► observabilidad (no liquidity)

Docs Truth ──► decisiones CEO correctas
Migrations discipline ──► reliability
```

---

## 18. Decision Log

Decisiones **verificadas** en código (no aspiracionales):

1. **Auto-approve write permanece OFF en producción** — requiere cambio de código para reactivar (`legacyAutoApproveWriteEnabled`).  
2. **Community submissions permanecen `pending`** — `communityPersistStatus` siempre retorna `pending`.  
3. **Money path fail-closed en producción** si `MONEY_PATH_FROZEN` ausente/inválido.  
4. **Rewards solo se activa con `REWARDS_PROGRAM_ACTIVE`** — `COMMISSION_PROGRAM_ACTIVE` no lo enciende.  
5. **Affiliate tags no son requisito para encontrar/listar una oferta** — sí para monetizar el click.  
6. **ML Worker (GHA) es el supply máquina real**; Railway en docs antiguas no es el camino operativo actual.  
7. **ML API legacy no es fuente confiable** mientras el 403 cloud persista.  
8. **Supply Router no inserta ofertas** (`persist: false`).  
9. **Dedupe timeout cooldown** existe (`timeout_cooldown` tras `auto_rejected_timeout`).  
10. **Price Memory a nivel producto existe** (`product_price_snapshots`).  
11. **Decision Engine opera en shadow** — no publica.  
12. **Comunidades in-app están retiradas del runtime** (redirect permanente).  
13. **Top (feed) ≠ motor Top Deals de supply.**  
14. **Día a Día retailers permanecen OFF** hasta flags + compliance.  

---

## Apéndice A — Cómo usar este documento

- Antes de implementar: leer secciones 5–9 y 15.  
- Antes de activar flags: sección 10 + 8.  
- Antes de confiar en un `.md` viejo: sección 11.  
- Si el código cambia una decisión del log: actualizar §18 y la fecha de corte.

## Apéndice B — Evidencia de producción

Cifras de cola/snapshots/supply runs son **observaciones puntuales** (auditoría ~2026-09-14).  
Para números actuales: paneles `/admin/hunter`, `/admin/moderation`, `/admin/owner` y tablas `hunter_supply_runs` / shadow cycles — no tratar cifras de este doc como SLA fijo.

---

*Fin Source of Truth V1.*
