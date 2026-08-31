# AVENTA — Launch Checklist

**Fecha de cierre técnico:** 2026-08-30  
**Veredicto:** LISTO PARA GO-LIVE COMUNITARIO (sin Rewards ni pagos)

---

## 1. Estado actual

| Área | Estado |
|------|--------|
| TypeScript | ✅ `tsc --noEmit` OK |
| Tests | ✅ 348 passed, 6 skipped |
| Build web | ✅ Next.js 16 production build OK |
| Build extensión | ✅ `npm run build:extension` OK |
| Hardening auth/seguridad | ✅ Implementado en fase anterior |
| Rewards | 🔒 OFF por defecto |
| Commission legacy | 🔒 OFF por defecto (`false`) |
| Migraciones obligatorias pendientes | Ninguna para lanzamiento comunitario |

---

## 2. Qué está terminado

- Feed de ofertas, votos, comentarios, favoritos
- Registro/login email + Google OAuth
- Consentimiento legal (UI + server-side en APIs comunitarias)
- Ban enforcement centralizado
- `offer_url` solo HTTPS
- Comentarios: oferta publicada + validación `parent_id`
- Middleware con `getUser()` en rutas protegidas
- OAuth callback sin open redirect (`resolveSafeOAuthNext`)
- Afiliados Amazon + Mercado Libre (tags + disclosure + tracking outbound)
- Moderación admin (`/admin/moderation`)
- Extensión V1 (modo desarrollador, compila correctamente)
- Crons definidos en `vercel.json` (7 rutas)
- Health endpoint: `GET /api/health`

---

## 3. Qué debe configurarse manualmente

> **REQUIERE VERIFICACIÓN MANUAL EN VERCEL/SUPABASE** para confirmar valores reales.

### Vercel (Production)

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY`
4. `CRON_SECRET` (string aleatorio largo; Vercel lo usa en crons automáticamente)
5. `NEXT_PUBLIC_APP_URL` → `https://aventaofertas.com`
6. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (recomendado)
7. Tags afiliados Amazon y ML (ver sección 5)
8. `RESEND_API_KEY` + `EMAIL_FROM` (si quieres digests/alertas)
9. Confirmar **ausencia** de `REWARDS_PROGRAM_ACTIVE=true`
10. Confirmar `COMMISSION_PROGRAM_ACTIVE=false` o ausente

### Supabase

1. Redirect URLs: `https://aventaofertas.com/auth/callback` (+ preview si aplica)
2. Site URL: `https://aventaofertas.com`
3. Migración de consentimiento legal aplicada en prod
4. RLS activo en tablas críticas (ya verificado en fase anterior)
5. Buckets `offer-images` y avatares públicos para lectura

---

## 4. Variables obligatorias

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, DB, storage |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente + APIs con RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Crons, admin server-side |
| `CRON_SECRET` | Protección de `/api/cron/*` |

Sin estas cuatro, producción no funciona correctamente.

---

## 5. Variables recomendadas

| Variable | Uso |
|----------|-----|
| `NEXT_PUBLIC_APP_URL` | SEO, emails, OAuth, links canónicos |
| `UPSTASH_REDIS_REST_URL` | Rate limits globales |
| `UPSTASH_REDIS_REST_TOKEN` | Par de Upstash |
| `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` | Tag en cliente (Cazar) |
| `AMAZON_ASSOCIATE_TAG` | Normalización al guardar |
| `NEXT_PUBLIC_ML_AFFILIATE_TAG` | Tag ML en cliente |
| `ML_AFFILIATE_TAG` | Normalización ML servidor |
| `ML_MATT_WORD` / `ML_MATT_TOOL` | Esquema colaborador ML (si aplica) |
| `RESEND_API_KEY` | Digests y emails transaccionales |
| `EMAIL_FROM` | Remitente verificado en Resend |
| `SYSTEM_ALERT_EMAIL_TO` | Alertas de integridad |
| `SYSTEM_ALERT_WEBHOOK_URL` | Slack/Discord alertas |

---

## 6. Variables que DEBEN permanecer OFF

| Variable | Valor seguro |
|----------|--------------|
| `REWARDS_PROGRAM_ACTIVE` | **Ausente** o `false` |
| `COMMISSION_PROGRAM_ACTIVE` | **`false`** o ausente |

⚠️ Si `COMMISSION_PROGRAM_ACTIVE=true`, el fallback en `isRewardsProgramActive()` también activaría Rewards.

---

## 7. Smoke test (≤15 minutos)

Ejecutar en **producción** después del deploy.

| # | Acción | Resultado esperado | Si falla |
|---|--------|-------------------|----------|
| 1 | Abrir `/` | Feed carga con ofertas | Supabase, build o feed view roto |
| 2 | `GET /api/health` | `{ "status": "ok" }` | DB o vista `ofertas_ranked_general` |
| 3 | Registro email nuevo | Cuenta creada + consentimiento | Auth Supabase o migración legal |
| 4 | Login Google | Redirige a `/` o `next` interno | Redirect URLs en Supabase |
| 5 | Ir a `/me` | Perfil visible | Middleware/auth |
| 6 | Publicar oferta en `/subir` | 200/201, status `pending` o `approved` | API offers, consentimiento, ban |
| 7 | Ver oferta en `/admin/moderation` | Aparece en cola (si pending) | Rol admin + service role |
| 8 | Votar oferta publicada | Voto guardado | API votes, consentimiento |
| 9 | Comentar oferta publicada | Comentario creado | API comments |
| 10 | Clic «Cazar oferta» | Nueva pestaña con URL afiliada (`?tag=` o `ascsubtag`) | Tags env o tracking |
| 11 | DevTools → Network: `POST /api/track-outbound` | 200 + `clickId` | Telemetría o oferta no trackable |
| 12 | Aprobar oferta en admin | Status `approved`, visible en feed | Moderación API |
| 13 | Cerrar sesión | No accede a `/me` | Auth/session |
| 14 | Anónimo en `/admin` | Redirige a `/` | Middleware |
| 15 | `GET /api/me/rewards/status` autenticado | `programActive: false` | Env mal configurado |

---

## 8. Rollback básico

1. **Vercel:** Promover deployment anterior estable desde el dashboard (Instant Rollback).
2. **Variables:** No cambiar `REWARDS_PROGRAM_ACTIVE` ni `COMMISSION_PROGRAM_ACTIVE` durante rollback.
3. **Supabase:** No ejecutar migraciones destructivas; rollback de DB solo si hay migración reciente documentada.
4. **Dominio:** Si auth falla post-deploy, verificar Site URL y Redirect URLs en Supabase antes de tocar código.

---

## 9. Primeras 24 horas post-lanzamiento

- [ ] Revisar `/admin/moderation` cada noche (ofertas pending, reportes, comentarios)
- [ ] Monitorear `GET /api/health` (uptime probe o manual)
- [ ] Revisar logs Vercel: errores 500 en auth, offers, votes
- [ ] Confirmar crons ejecutaron (Vercel → Cron Jobs → logs)
- [ ] Verificar que ningún usuario reporte problemas de login Google
- [ ] Probar una oferta Amazon y una ML: tag afiliado visible en URL final
- [ ] Confirmar `programActive: false` en rewards status
- [ ] No activar Rewards ni Commission bajo ninguna circunstancia sin revisión legal

---

## 10. Crons en producción (`vercel.json`)

| Ruta | Schedule (UTC) | Propósito |
|------|----------------|-----------|
| `/api/cron/daily-digest` | `0 1 * * *` | Email diario |
| `/api/cron/system-integrity` | `30 2 * * *` | Checks + alertas |
| `/api/cron/offer-health-scan` | `0 3 * * *` | Salud de precios |
| `/api/cron/weekly-digest` | `0 0 * * 1` | Email semanal |
| `/api/cron/ml-oauth-refresh` | `0 4 * * *` | Refresh OAuth ML |
| `/api/cron/process-write-queue` | `45 3 * * *` | Cola de eventos |
| `/api/cron/rewards-release-holds` | `0 5 * * *` | Holds vencidos (no payout) |

Todos requieren `CRON_SECRET`. Vercel lo envía automáticamente como `Authorization: Bearer`.

**No incluidos en vercel.json:** `bot-ingest`, `bot-ingest-candidates` (manual, cron externo o Vercel Pro).

---

## 11. Checklist manual corta (pre-lanzamiento)

- [ ] Variables obligatorias en Vercel Production
- [ ] `REWARDS_PROGRAM_ACTIVE` no activo
- [ ] `COMMISSION_PROGRAM_ACTIVE=false`
- [ ] Upstash configurado
- [ ] Tags Amazon + ML configurados
- [ ] Supabase redirect URLs correctas
- [ ] Deploy a producción
- [ ] Smoke test 15 puntos completado
- [ ] Contenido inicial listo (ofertas, videos)
- [ ] Plan de moderación nocturna definido

---

## Siguiente paso

**No es código.** Es: configurar → deploy → smoke test → contenido → lanzar → observar usuarios reales.
