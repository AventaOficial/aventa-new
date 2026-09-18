# AUDIT — Staging Environment Forensics

**Fecha:** 2026-09-17  
**Modo:** Forensic only. Sin migrations, deploy, seeds, Distribution D2, money/Supply/attribution.  
**Pregunta:** ¿Existe un entorno staging real y cuál es su Supabase project-ref?

---

## 1. Decision (canonical)

**Clasificación primaria: `D) CONFLICTING_CONFIGURATION`**

**Clasificación secundaria (realidad operativa): `C) NO_STAGING`**

No existe evidencia de un Supabase project-ref de staging **distinto** de producción.  
El único ref vivo documentado y usado localmente es producción, a veces **mal etiquetado** como “staging” en scripts/tests de rewards.

**Vercel Preview vs misma DB:** `E) UNKNOWN` a nivel de variables Preview en dashboard (MCP Vercel roto; sin `.vercel/` en repo). La SoT canónica marca Staging 🔴 “Solo Preview” — implica ausencia de staging DB dedicado, no verifica si Preview apunta a prod.

---

## 2. Environment matrix

| Environment | Supabase URL/ref | Fuente | Confianza |
|-------------|------------------|--------|-----------|
| **production** | `mkgsrpsuvedwwlzmzmzh` (`*.supabase.co`) | `docs/LINEA_TIEMPO_AVENTA.md` (“Producción actual”); migraciones 20260916 “PROD”; plaza-audit “Prod”; worker → `aventaofertas.com`; `.env.local` host = mismo ref | **HIGH** |
| **preview** (Vercel) | **UNKNOWN** (¿mismo ref u otro?) | SoT: Staging = “Solo Preview”; `VERCEL_ENV=preview` en código; sin config de env Preview en repo | **LOW** (runtime Preview existe; DB binding no verificado) |
| **staging** (DB dedicada) | **NONE found** | SoT Staging 🔴; no `.env.staging`; no project-ref staging distinto | **HIGH that it does not exist in repo evidence** |
| **development/local** | `mkgsrpsuvedwwlzmzmzh` (via `.env.local`) | Host extracted from local env (no secrets printed) | **HIGH** (dev points at prod DB) |
| **legacy / prototype** | `oojshofrpbfwsiypcecr` | Timeline: “Prototipo original”; plaza: sin tablas plaza | **HIGH as legacy, not current staging** |
| **CI** | `https://example.supabase.co` (dummy) | `.github/workflows/ci.yml` | **HIGH** (fake; no real DB) |

---

## 3. Supabase evidence

### Refs encontrados (únicos)

| Ref | Nombre histórico | Rol según evidencia canónica |
|-----|------------------|------------------------------|
| `mkgsrpsuvedwwlzmzmzh` | Aventa Cazadores de ofertas | **Producción actual** |
| `oojshofrpbfwsiypcecr` | AventaOficial's Project | Prototipo legacy (jul 2025) |

### CONFLICT (mismo ref, dos etiquetas)

| Fuente | Etiqueta de `mkgsrpsuvedwwlzmzmzh` |
|--------|-----------------------------------|
| `docs/LINEA_TIEMPO_AVENTA.md` | Producción actual |
| `docs/SYSTEMS/MIGRATION_20260916_*.md` | **PROD** / Applied |
| `docs/hse/.../plaza-audit/*` | Prod |
| `scripts/verify-rewards-staging.mjs` | `environment: 'staging/dev (mkgsrpsuvedwwlzmzmzh…)'` + `productionProjectNotTouched: 'oojshofrpbfwsiypcecr'` |
| `tests/rewards/stagingManualQa.integration.test.ts` | `STAGING_REF = 'mkgsrpsuvedwwlzmzmzh'` |

**No se elige una etiqueta por intuición.** El conflicto está documentado: scripts de “staging” QA apuntan al ref que el resto del sistema trata como **producción**, y declaran “prod no tocado” = legacy `oojshofrpbfwsiypcecr` (incorrecto respecto a la SoT de infra).

### Repo layout

- `supabase/config.toml`: **ausente**
- `supabase/migrations/`: **0 files** (vacío / gap)
- SQL canónico: `docs/supabase-migrations/*.sql`
- Apply documentado: `npx supabase db query --linked -f …` (manual)

---

## 4. Vercel evidence

| Pregunta | Evidencia | Confianza |
|----------|-----------|-----------|
| ¿Proyecto Vercel staging separado? | No en repo; dominio prod `aventaofertas.com`; sin `.vercel/` | **MEDIUM-HIGH** (ausencia en repo ≠ prueba absoluta de dashboard) |
| ¿Worker apunta a prod? | `AVENTA_INGEST_ENDPOINT: https://aventaofertas.com/...` en GHA | **HIGH** |
| ¿Preview usa Supabase distinto? | No documentado en repo; MCP Vercel **error** | **UNKNOWN** |
| ¿`VERCEL_ENV` distingue prod/preview? | Sí en `moneyPathFreeze` / ingest (runtime flag, no DB URL) | **HIGH** |

---

## 5. CI/CD evidence

| Workflow | DB / secrets | Mutates remote DB? |
|----------|--------------|--------------------|
| `.github/workflows/ci.yml` | Dummy `example.supabase.co` | No |
| `.github/workflows/mercadolibre-worker.yml` | Cron secret → **prod** URL | Ingest API prod (discovery-only flag) |
| Migration workflows | **Ninguno** | — |

---

## 6. Migration workflow (canónico observado)

1. Autores escriben SQL en `docs/supabase-migrations/`.  
2. Aplicación **manual** contra proyecto **linked**: `npx supabase db query --linked -f <file>`.  
3. Registro post-facto en `docs/SYSTEMS/MIGRATION_*.md` citando project `mkgsrpsuvedwwlzmzmzh` como PROD.  
4. **No** hay `supabase db push` / `migration up` automatizado en CI.  
5. **Riesgo:** `--linked` sin staging = write a **producción**.

---

## 7. Production project-ref

**`mkgsrpsuvedwwlzmzmzh`**

Confianza: **HIGH** (timeline + migration PROD docs + plaza prod + local env host + worker prod domain).

---

## 8. Staging project-ref

**NONE (verified absence in repo evidence).**

Cualquier claim de staging = `mkgsrpsuvedwwlzmzmzh` es **CONFLICT** con docs canónicos de producción — **no usar como staging para migrations**.

Legacy `oojshofrpbfwsiypcecr` ≠ staging actual (prototipo; no es el destino de migraciones 20260916).

---

## 9. Recommendation

1. **No** aplicar `20260917_distribution_engine_foundation.sql` hasta existir staging real.  
2. **No** usar Vercel Preview como “staging de schema” mientras el binding de Supabase Preview sea UNKNOWN / posible shared-prod.  
3. **Crear** un proyecto Supabase staging nuevo (ref distinto), documentarlo en SoT, y:
   - `.env.staging` / Vercel Preview env → URL staging  
   - Production env → solo `mkgsrpsuvedwwlzmzmzh`  
   - Corregir scripts/tests que llaman “staging” al ref de prod  
4. Solo entonces retomar P0-D2 FASE 1.

---

## 10. Security note

Este audit no imprime service role keys, tokens ni passwords. Solo project-refs y hosts públicos `*.supabase.co`.
