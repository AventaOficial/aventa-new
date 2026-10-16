# Cierre de ejecución — Comunidad y Rewards

**Fecha:** 2026-10-16  
**Snapshot de auditoría:** [`FINAL_SHIP_AUDIT_2026-10-16.md`](./FINAL_SHIP_AUDIT_2026-10-16.md)  
**Producción:** `https://aventaofertas.com` · deploy solo desde **`master`** · Supabase prod `mkgsrpsuvedwwlzmzmzh`  
**Rama Team OS (no prod):** `feat/team-os-staff-elimination` · PR **#167**  
**Nota:** No se encontró archivo literal «Markdown pegado» en el repo (búsqueda glob/texto). Prompt MCP xAI sigue en `SOFT_LAUNCH_NOV_1_2026.md` §C.

**Reglas de seguridad (no negociables):**

- **Nunca** `MONEY_PATH_FROZEN=false` en Production sin GO escrito de finanzas (`MONEY_REWARDS_GO_LIVE.md`).
- **No** mergear `feat/team-os-staff-elimination` → `master` sin runbook §3 de este doc (SQL staging → verificación → prod).
- **No** SQL destructivo en prod (solo migración idempotente documentada + limpieza `user_roles` no-owner **después** de verificar membresías).

---

## 1. Lanzamiento comunitario (camino mínimo)

### 1.1 Checklist operativo

| ☐/☑ | Ítem | Evidencia | Owner |
|-----|------|-----------|-------|
| ☐ | Health prod `feedViewOk` + volumen catálogo | `curl -sS https://aventaofertas.com/api/health` · audit 16-oct: 1594 ofertas | Ops |
| ☐ | Feed recientes responde | `GET /api/feed/home?limit=5&view=latest` | Eng |
| ☐ | `npx vitest run tests/launch` en rama de release | 122 tests OK (16-oct local) | Eng |
| ☐ | Cola moderación `pending` en plan SLA | SQL/doc 15-oct: 0; revalidar día −1 | Ops |
| ☐ | Flags económicos prod confirmados (tabla §1.2) | Vercel + `node scripts/launch/verify-prod-economic-flags.mjs` | **Jafet/Ops** |
| ☐ | Backup / restore Supabase (§1.3) | Panel Supabase + decisión firmada | **Jafet/Ops** |
| ☐ | Smoke móvil 15 min (§1.4) | Capturas / notas QA | Product/**Jafet** |
| ☐ | Copy público Rewards alineado (§1.5) | Diff revisado; deploy `master` si hay cambios | Product |
| ☐ | Solo merges de bajo riesgo a `master` | PRs sin Team OS / sin dinero | Eng |
| ☐ | Día lanzamiento: probes + `system-integrity` | Log cron / health | Ops |

**Gate merge PR #167 (Team OS):** ☐ **NO** es requisito del soft launch 1 nov. Si se mergea antes del 1 nov, debe completarse §3 primero.

**Gate merge cualquier PR a `master` para 1 nov:** ☐ SQL staging aplicado **solo** si el PR incluye Team OS o cambios de auth colaborador.

---

### 1.2 Variables económicas Production (inventario código + verificación Vercel)

| Variable | Rol en código | Default / fail-closed | Valor esperado soft launch (Fase A) | Estado prod |
|----------|---------------|------------------------|-------------------------------------|-------------|
| `MONEY_PATH_FROZEN` | `lib/server/moneyPathFreeze.ts` | Prod: ausente o inválido → **congelado** | `true` explícito (mínimo: ausente con `VERCEL_ENV=production`) | **☑ `true`** (Vercel MCP prod, id `VS7ciQlKQLck8nJS`, 2026-10-16) |
| `REWARDS_PROGRAM_ACTIVE` | `lib/rewards/programStatus.ts` | Ausente → **OFF** | Doc Fase A: `true` (reconocimiento / desbloqueos; sin mover dinero si freeze ON) | **☑ `true`** (Vercel MCP prod, id `Vufs87s9h4Tvx4lw`) |
| `REWARDS_PAYOUT_ENABLED` | `lib/rewards/betaCohort.ts` | Ausente → **OFF** | `false` / ausente | **☑ `false`** (Vercel MCP prod, id `uZ0i0DxgRhUPtcIw`) |
| `REWARDS_BETA_UI_ENABLED` | `lib/rewards/betaCohort.ts` | Ausente → **OFF** | `false` hasta cohorte invitada; ON solo UX | **☑ ausente en Production** (sin fila en Vercel → OFF en runtime) |
| `SETTLEMENT_BRIDGE_ENABLED` | `lib/economy/settlement/isSettlementBridgeEnabled.ts` | Ausente → **OFF** | `false` / ausente | **UNKNOWN** |
| `COMMISSION_PROGRAM_ACTIVE` | `lib/commissions/programStatus.ts` | Default string `false` | `false` | **UNKNOWN** |
| `PAYOUT_PROVIDER` | `lib/rewards/payoutIntent/resolveProvider.ts` | Prod fail-closed sin PSP | ausente, `stub`, o sandbox — **no** `real` | **UNKNOWN** |
| `PAYOUT_PROVIDER_API_URL` / `*_KEY` / `*_WEBHOOK_SECRET` | `realProviderConfig.ts` | Requeridos solo si `real` | ausentes en soft launch | **UNKNOWN** |

Variables relacionadas (no cambiar en prod sin runbook monetario): `REWARDS_HOLD_DAYS`, shares en `lib/rewards/config.ts` (código, no env).

#### Pasos exactos de verificación (Vercel)

1. Instalar CLI y enlazar proyecto `aventa-new` (si no está):
   ```powershell
   npm i -g vercel
   cd C:\Users\yanin\Projects\aventa-new
   vercel link
   ```
2. Descargar env de **Production** (no commitear el archivo):
   ```powershell
   vercel env pull .env.production.local --environment=production
   ```
3. Ejecutar chequeo local read-only:
   ```powershell
   $env:VERCEL_ENV="production"
   $env:NODE_ENV="production"
   node scripts/launch/verify-prod-economic-flags.mjs
   ```
4. **Confirmación humana:** Vercel Dashboard → Project `aventa-new` → Settings → Environment Variables → filtro **Production**. Anotar valor literal de cada fila de la tabla y marcar ☑ en §1.1.
5. Probes HTTP (sin secretos):
   ```powershell
   curl.exe -sS "https://aventaofertas.com/api/health"
   ```

**Criterio GO:** `MONEY_PATH_FROZEN` efectivamente congelado + `REWARDS_PAYOUT_ENABLED` off + sin PSP real. `REWARDS_PROGRAM_ACTIVE=true` solo si Product confirma mensaje Fase A (§1.5).

#### Evidencia 2026-10-16 (cierre operativo)

| Fuente | Resultado |
|--------|-----------|
| `node scripts/launch/verify-prod-economic-flags.mjs` (sin `.env.production.local`) | **exit 1** — `isMoneyPathFrozen()=false` en runtime local (sin `VERCEL_ENV=production`); esperado hasta `vercel env pull` |
| Vercel MCP `filter_project_envs` + `get_project_env` en proyecto **`aventa-new`**, target **Production** | Valores desencriptados: `MONEY_PATH_FROZEN=true`, `REWARDS_PROGRAM_ACTIVE=true`, `REWARDS_PAYOUT_ENABLED=false`; `REWARDS_BETA_UI_ENABLED` **no definida** |
| Nota higiene | Existe `REWARDS_BETA_ENABLED=true` en Production (legacy; **no** la lee `lib/rewards/betaCohort.ts`). Opcional: borrar o alinear nombre con `REWARDS_BETA_UI_ENABLED` en dashboard |
| `GET https://aventaofertas.com/api/health` | `status: ok`, `feedViewOk: true`, `offersCount: 1594` |

**Conclusión flags:** Alineado con perfil `soft_launch_community` en **runtime Production real** (freeze ON, payout OFF, programa Fase A ON, beta UI OFF).

---

### 1.3 Supabase backup / restore — opciones y recomendación

| Opción | Qué obtienes | Esfuerzo | Riesgo si no |
|--------|----------------|----------|--------------|
| **A — Supabase Pro + backups diarios de panel** | Restore desde backup gestionado (RPO ~24 h según doc Supabase) | Owner sube plan; verificar backup visible | Pérdida hasta 24 h ante desastre |
| **B — Pro + PITR (add-on)** | Point-in-time recovery | Costo extra; configurar en panel | Menor RPO |
| **C — Aceptar riesgo documentado** | Sin restore verificable | Firma de decisión (párrafo abajo) | **NO-GO** formal en `AVENTA_FINAL_CLOSURE_MATRIX.md` |

**Recomendación (docs existentes):** Opción **A** como mínimo antes de escalar tráfico; ideal **B** si el ledger monetario crece. Referencias: `AVENTA_PRODUCTION_CLOSURE_STATUS.md`, `AVENTA_FINAL_CLOSURE_MATRIX.md` (plan Free histórico), `scripts/restore-checklist.mjs`.

#### Plantilla — decisión firmada

> Yo, **Jafet** (pendiente firma), en calidad de owner de AVENTA, el día **16/10/2026**, declaro que el proyecto Supabase `mkgsrpsuvedwwlzmzmzh` está en plan **UNKNOWN vía MCP** (doc histórico: org `AventaOficial`, tier **Free** en `AVENTA_FINAL_CLOSURE_MATRIX.md`) con backup **no verificado por agente** (frecuencia: **UNKNOWN**) y restore verificado el **N/A** (proyecto de prueba: **N/A**), **o bien** acepto lanzar el soft launch comunitario sin restore verificable asumiendo el riesgo de pérdida de datos hasta RPO no acotado. Firma: **___________ (pendiente owner)**.

| ☐/☑ | Acción | Owner |
|-----|--------|-------|
| ☐ | Confirmar plan actual en Supabase Dashboard | **Jafet** |
| ☐ | Upgrade Pro si aplica | **Jafet** |
| ☐ | Restore de prueba a proyecto nuevo | Ops/**Jafet** |
| ☐ | Párrafo firmado archivado (Drive/Notion) | **Jafet** |

**Evidencia 2026-10-16:** Supabase MCP — proyecto prod `mkgsrpsuvedwwlzmzmzh` (`Aventa Cazadores de ofertas`) **ACTIVE_HEALTHY**; `get_project` no expone tier/plan; advisors de seguridad sin ítem de backup/PITR. **Riesgo aceptado documentado** pendiente firma owner (no bloquea copy/flags; sí condición formal en matriz de cierre).

---

### 1.4 Smoke móvil manual (~15 min)

Ejecutar en **teléfono real** (iOS o Android), Safari/Chrome, usuario de prueba con sesión. Marcar ☐ hasta completar.

| Paso | Ruta / acción | Resultado esperado |
|------|----------------|-------------------|
| 1 | Abrir `/` | Home carga; tabs Top/Recientes visibles; sin error blanco |
| 2 | Cambiar a Recientes | Lista con ofertas; scroll fluido |
| 3 | Abrir una ficha oferta | Imagen, precio, botón tienda; votar (si logueado) |
| 4 | `/subir` o flujo subir oferta | Formulario usable; teclado no tapa CTA crítico |
| 5 | Plaza / comunidad (ruta principal de plaza) | Hilos cargan |
| 6 | Login → `/me` | Perfil y navegación inferior sin solaparse con gestos |
| 7 | `/me/recompensas` | Hero indica **pagos no disponibles** o **retiros en pausa** (Fase A/FROZEN); sin CTA de cobrar activo |
| 8 | Abrir guía/modal de programa si existe | Texto legible; sheet no transparente sobre contenido |
| 9 | `/comisiones` | Aviso «no está activo públicamente» / sin pagos |
| 10 | Cerrar sesión / volver a home | Sin crash |

**Evidencia sugerida:** 3–5 capturas (home, ficha, recompensas, comisiones) + modelo de dispositivo y fecha.

#### Evidencia proxy 2026-10-16 (cursor-ide-browser, viewport móvil ~390×844)

**Limitación:** sin teléfono real ni OTP; sesión del navegador de automatización ya autenticada en `/me` y `/settings`.

| Paso / prueba | Resultado |
|---------------|-----------|
| `https://www.aventaofertas.com/` home | **PASS** — feed con ofertas, tabs visibles |
| Tab Recientes | **PASS** — lista de ofertas tras clic |
| `GET /api/feed/home?limit=3&view=latest` | **PASS** — `success: true` |
| `/comisiones` | **PASS** — aviso «no está activo públicamente», sin promesa de pagos activos |
| `/login` | **N/A** — 404 (auth vía modal/OTP; no ruta dedicada) |
| `/me` sin cookie (`curl` anónimo) | **PASS** — HTTP **307** → `/` |
| `/me` con sesión automation | **PASS** — perfil carga |
| §1.4 pasos 3–8 (ficha, subir, plaza, recompensas) | **NO ejecutados** en esta pasada — pendiente smoke 15 min en dispositivo real (**Jafet**) |

---

### 1.5 Comunicación pública Rewards — diff narrativa

**Narrativa deseada (soft launch + pre-cohorte):**

- Desbloqueo por **mérito** (ofertas aprobadas + votos de calidad).
- Cohorte monetaria futura **~100 cazadores por invitación**, sin «carrera» pública por el cupo.
- Hoy: **sin pagos** ni programa monetario público; Fase A puede permitir reconocimiento/progreso si `REWARDS_PROGRAM_ACTIVE=true` con freeze.

| Superficie | Estado actual (repo `master` / contenido estático) | Brecha vs narrativa | Acción |
|------------|---------------------------------------------------|---------------------|--------|
| `/comisiones` (`app/comisiones/page.tsx`) | Aviso fuerte: programa **no activo públicamente**, sin pagos; pasos por mérito | No menciona cohorte beta ni invitación | **☑ 2026-10-16:** prod y repo alineados — **no bloqueante**; párrafo cohorte sigue opcional (§1.5.1) |
| `/me/recompensas` | Dinámico: `lib/rewards/onboarding.ts` — FROZEN → «Retiros en pausa» + pagos no disponibles | No explica cohorte invitada ni cupo ~100 | **Doc:** copy en tracker; beta UX vía `RewardsBetaOnboarding` cuando `REWARDS_BETA_UI_ENABLED` |
| `/terms` §8 | Elegibilidad por mérito; programa activo solo si anunciado | No dice «solo invitados» para pagos futuros | Alinear con legal antes de cohorte (`MONEY_REWARDS_PRODUCTION_FRIENDS_PILOT.md` §legal) |
| Marketing externo | Fuera de repo | UNKNOWN | **Jafet/Product** |

#### 1.5.1 Strings propuestos (solo si Product aprueba — no desplegados en este cierre doc)

**Archivo:** `app/comisiones/page.tsx` — insertar después del párrafo ámbar «Importante» (aprox. línea 63):

```text
Cuando AVENTA abra pagos reales, lo hará primero con una cohorte beta reducida
(por invitación, del orden de ~100 cazadores), sin carrera pública por plazas.
Hoy no hay lista de espera ni garantía de invitación: el progreso por mérito
sirve para reconocer calidad, no para reservar un pago.
```

**Archivo:** `lib/rewards/onboarding.ts` — `PROGRAM_STATUS_COPY.FROZEN.description` — añadir frase final:

```text
Los pagos, cuando existan, serán solo para la cohorte invitada que AVENTA anuncie;
no hay competencia por un cupo fijo en la app.
```

---

### 1.6 Deploy `master` — regla

| Regla | Detalle |
|-------|---------|
| Producción | Solo deployments desde rama **`master`** en Vercel |
| Pre-merge | `npm run ci:verify` en la PR |
| PR #167 | **Gate:** SQL `20261017_staff_roles_to_team_memberships.sql` en **staging** + matriz auth §3.3 + checklist §3.2 |
| Prohibido en gate 1 nov | Merge Team OS sin SQL; cualquier `MONEY_PATH_FROZEN=false` en Production |

---

## 2. Rewards monetario (proyecto ejecución ~15 %)

**Veredicto audit:** **NO-GO** cohorte pagadora hasta completar paquetes y evidencia.

### 2.1 Paquetes de trabajo (orden)

| # | Paquete | Entregable / enlace | Evidencia de cierre | NO-GO hasta |
|---|---------|---------------------|---------------------|-------------|
| WP1 | **Activación staging dinero** | `docs/LAUNCH/MONEY_REWARDS_STAGING_ACTIVATION.md`, `scripts/verify-rewards-staging.mjs` | Script exit 0 + crons 24 h sin drift | WP1 ☑ |
| WP2 | **Fiscal Rewards V1** | `docs/REWARDS_MONEY_FISCAL_BOUNDARY.md` §C; endurecer `app/api/me/commission-fiscal/route.ts` | Asesoría fiscal + gate en API o retiro ruta | WP2 ☑ |
| WP3 | **PSP / SPEI** | `lib/rewards/payoutIntent/resolveProvider.ts`, `realProviderConfig.ts` | Contrato + webhook + sandbox certificado | WP3 ☑ |
| WP4 | **Términos / legal** | `MONEY_REWARDS_PRODUCTION_FRIENDS_PILOT.md`, UI términos en `/me/recompensas` | Sign-off legal escrito | WP4 ☑ |
| WP5 | **Reconciliación atribución ↔ ledger** | Cadena §B boundary doc; finanzas | Informe conciliación staging | WP5 ☑ |
| WP6 | **Procedimiento E2E monetario** | Staging: programa ON, freeze OFF, payout OFF → luego payout sandbox | Checklist firmado Eng+Finanzas | WP6 ☑ |
| WP7 | **Cohorte ~100** | `lib/rewards/betaCohort.ts`, `lib/rewards/betaCohortStore.ts`, migración `20261005_rewards_beta_cohort.sql` | Tabla poblada invited→enrolled; `REWARDS_BETA_UI_ENABLED` según UX | WP7 ☑ |

### 2.2 Criterios NO-GO explícitos (prod)

- `MONEY_PATH_FROZEN=false` sin GO finanzas documentado.
- `REWARDS_PAYOUT_ENABLED=true` sin WP3+WP4+WP6.
- `PAYOUT_PROVIDER=real` sin credenciales y canary M5.6.
- Cohorte sin membresías en `rewards_beta_memberships`.
- `POST /api/me/commission-fiscal` abierto sin frontera fiscal V1 (gap verificado en audit).

### 2.3 Referencias código

| Tema | Ruta |
|------|------|
| Cohorte | `lib/rewards/betaCohort.ts`, `tests/rewards/betaCohort.test.ts` |
| Payout intent | `lib/rewards/payoutIntent/*`, `tests/rewards/payoutIntent.*.test.ts` |
| Fiscal API | `app/api/me/commission-fiscal/route.ts` |
| Go-live | `docs/LAUNCH/MONEY_REWARDS_GO_LIVE.md` |

---

## 3. Team OS sin romper prod

**Contexto:** Prod despliega `master` (auth moderación vía `user_roles`). PR #167 introduce `lib/server/collaboratorAuth.ts` y **residual** `/admin/staff-roles` (`TeamRolesPanel`, `app/api/admin/staff-roles/route.ts`) — revisar intención vs `docs/SYSTEMS/STAFF_ELIMINATION_AUDIT_AND_MIGRATION.md` (doc dice panel eliminado; rama feat lo mantiene para roles de panel).

### 3.1 Runbook merge seguro

| Paso | Acción | ☐/☑ | Owner |
|------|--------|-----|-------|
| 1 | Backup / snapshot Supabase staging | ☐ | Ops |
| 2 | Aplicar en **staging** `docs/supabase-migrations/20261017_staff_roles_to_team_memberships.sql` | ☐ | Eng |
| 3 | Por cada colaborador: verificar fila en `team_memberships` ACTIVE con permisos esperados | ☐ | Eng/Ops |
| 4 | Resolver manualmente roles `admin` / `gerente` (sin auto-migración) | ☐ | **Jafet** |
| 5 | Ejecutar matriz §3.3 en staging con usuarios reales de prueba | ☐ | Eng |
| 6 | Merge PR **#167** → `master`; esperar deploy Production | ☐ | Eng |
| 7 | Aplicar **mismo SQL** en prod (idempotente) | ☐ | Eng |
| 8 | Re-ejecutar matriz §3.3 en prod | ☐ | Eng/Ops |
| 9 | Eliminar filas `user_roles` **no-owner** solo tras ☑ pasos 3 y 8 | ☐ | Eng |
| 10 | `npx vitest run tests/server/collaboratorAuth.test.ts tests/server/middlewareRoleGate.test.ts tests/team/` | ☐ | Eng |

**Rollback:** revertir deploy `master` al deployment anterior; **no** borrar membresías sin plan; restaurar filas `user_roles` desde backup si se eliminaron.

### 3.2 Checklist doc eliminación staff (§8)

| Ítem | Estado |
|------|--------|
| No UI «agregar rol staff» legacy en Team OS puro | ☑ código feat |
| APIs moderación → Team OS | ☑ feat |
| `/admin/team` solo Team OS | ☑ |
| SQL prod + limpieza `user_roles` | ☐ |
| Cero lecturas funcionales `user_roles` excepto owner | ☐ (residuales UI moderación) |

### 3.3 Matriz verificación auth (staging → prod)

| Persona | Setup | Ruta / API | Esperado |
|---------|-------|------------|----------|
| Moderador | `team_memberships` moderation ACTIVE | `GET /api/admin/moderation/...` (decisión oferta) | 200 con permiso |
| Moderador | sin membresía, solo `user_roles.moderator` **post-limpieza** | misma API | **401/403** (solo Team OS) |
| Finanzas | `finance` + `finance.overview.read` | `/equipo` + APIs finanzas lectura | 200 |
| Owner | `user_roles.owner` | `/admin/*`, Founder OS | 200 |
| Miembro suspendido | `team_memberships.status=SUSPENDED` | APIs colaborador | 403 en siguiente request |
| Usuario comunidad | sin membresía | `/admin` | redirect / 403 |
| Staff roles UI | owner | `/admin/staff-roles` | Panel carga (residual PR #167) |

Tests automatizados: `tests/admin/teamOsStaffSeparation.test.ts`.

---

## 4. Validación final GO / NO-GO

**Fecha evaluación:** 2026-10-16  
**Evaluadores:** Comunidad **Agente cierre ops** · Monetario **Agente cierre ops** (evidencia; firmas owner pendientes)

**PR #167:** **OPEN** — [feat(team): migrar colaboradores a Team OS…](https://github.com/AventaOficial/aventa-new/pull/167). **No mergeado** (correcto; no es gate 1 nov).

### 4.1 Comunidad (1 nov)

| Prueba | Comando / URL | Resultado | ☐/☑ |
|--------|---------------|-----------|-----|
| Launch suite | `npx vitest run tests/launch` | 122/122 (audit 16-oct; no re-ejecutado hoy) | ☐ |
| Health | `GET /api/health` | `status: ok`, `feedViewOk: true`, 1594 ofertas | ☑ |
| Feed | `GET /api/feed/home?limit=3&view=latest` | `success: true` | ☑ |
| Flags económicos | Script local exit 1 sin env pull; **Vercel MCP prod** | freeze `true`, payout `false`, programa `true` | ☑ |
| Backup | §1.3 decisión | Riesgo documentado; **firma Jafet pendiente** | ☐ |
| Smoke móvil | §1.4 | Proxy browser OK; **smoke 15 min teléfono pendiente** | ☐ |
| Copy | §1.5 | `/comisiones` prod sin promesa de pagos activos | ☑ |

**Veredicto comunidad:** ☐ GO · ☑ **GO con condiciones** · ☐ NO-GO  
**Condiciones:** (1) Jafet firma §1.3 (Pro+restore o riesgo aceptado). (2) Smoke §1.4 completo en teléfono real antes del 1 nov. (3) Opcional: `vercel env pull` + script exit 0 para repetibilidad local.

### 4.2 Monetario (cohorte ~100)

| Puerta | Evidencia | ☐/☑ |
|--------|-----------|-----|
| WP1–WP7 §2.1 | Sin cierre; ver §2.1 | ☐ |
| Ledger prod sin sorpresas | No auditado hoy (freeze ON + payout OFF en Vercel) | ☐ |
| Finanzas GO escrito | Ausente | ☐ |

**Veredicto monetario:** ☑ **NO-GO** (esperado pre-1-nov) · ☐ GO piloto

### 4.3 Firmas

| Rol | Nombre | Fecha | Comunidad | Monetario |
|-----|--------|-------|-----------|-----------|
| Owner (**Jafet**) | | | ☐ | ☐ |
| Eng | | | ☐ | ☐ |
| Ops | | | ☐ | ☐ |
| Product | | | ☐ | ☐ |

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-10-16 | Creación tracker + script `verify-prod-economic-flags.mjs` |
| 2026-10-16 | Cierre ops: evidencia Vercel MCP flags, health/feed, smoke proxy, §4 GO condicional / monetario NO-GO; PR #167 OPEN sin merge |
