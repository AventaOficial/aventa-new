# AVENTA — Post-Launch Backlog

Pendientes identificados en auditorías de pre-lanzamiento. **Ninguno bloquea el go-live comunitario.**

---

## P1 — Importante después del lanzamiento

| Item | Descripción | Origen |
|------|-------------|--------|
| Upstash en producción | Sin `UPSTASH_*`, rate limits son por instancia serverless (débil ante abuso). Configurar en Vercel. | `lib/server/rateLimit.ts` |
| Tags afiliados en Vercel | Sin `AMAZON_*` / `ML_*`, enlaces funcionan pero sin comisión para Aventa. | `lib/affiliate/applyPlatformAffiliateTags.ts` |
| Resend + dominio verificado | Sin `RESEND_API_KEY`, no hay digests ni emails de moderación. Auth email sigue en Supabase. | Crons digest, `sendModerationEmail.ts` |
| Alertas operativas | Configurar `SYSTEM_ALERT_EMAIL_TO` y/o `SYSTEM_ALERT_WEBHOOK_URL` para fallos de integridad. | `/api/cron/system-integrity` |
| Datos fiscales legales | Razón social, RFC, domicilio — requerido antes de activar pagos/Rewards. | `/terms`, `/privacy` |
| Chrome Web Store | Extensión V1 lista técnicamente (`READY FOR CHROME WEB STORE`); falta publicación en tienda. | `browser-extension/` |
| Editar/republicar ofertas desde `/me` | Botones rotos removidos; flujo actual = publicar nueva oferta. | `OfferCard`, `/me` |
| Gate `isRewardsProgramActive` en cron holds | `rewards-release-holds` procesa filas `VALIDATING` existentes sin chequear flag; irrelevante si no hay datos de prueba en prod. | `lib/rewards/rewardsEngine.ts` |

---

## P2 — Mejoras

| Item | Descripción | Origen |
|------|-------------|--------|
| `requireCommunityUser` en más APIs | `parse-offer-url`, reporte de comentarios y `upload-profile-avatar` tienen auth pero no consentimiento/email/ban completo. | Auditoría FASE 1 |
| Bot ingest automatizado | `bot-ingest` no está en `vercel.json`; requiere cron externo, Vercel Pro o ejecución manual. | `.env.example`, `vercel.json` |
| Rate limit documentado en panel | `/admin/infraestructura` ya muestra estado; añadir alerta si Upstash cae en prod. | `buildInfrastructureStatus.ts` |
| Migración middleware → proxy | Warning Next.js 16: convención `middleware` deprecada. | Build output |
| Comunidades placeholder | Si el tab sigue visible con "próximamente", mover a footer o ocultar. | Docs auditoría UX |
| OAuth ML parser | `ML_OAUTH_*` opcional; mejora parseo autenticado de ML. | `.env.example` |
| Admin payout UI camelCase | Bug menor en panel legacy; irrelevante con Rewards OFF. | Auditoría previa |

---

## P3 — Nice-to-have

| Item | Descripción | Origen |
|------|-------------|--------|
| Otras redes afiliadas | AliExpress, Temu, Walmart, Shein — env documentados pero no implementados para lanzamiento. | `.env.example` |
| PWA / push notifications | No requerido para v1 comunitaria. | — |
| Dashboard operativo ampliado | Panel admin actual es suficiente para una persona. | Solicitud explícita: no construir |
| Tests E2E browser automatizados | Smoke test manual documentado en `LAUNCH_CHECKLIST.md`. | — |
| Feed cache tuning | `FEED_CACHE_*` opcionales; defaults funcionan. | `lib/server/feedCache.ts` |

---

## Explícitamente fuera de alcance (no tocar sin decisión de producto)

- Activar `REWARDS_PROGRAM_ACTIVE`
- Activar `COMMISSION_PROGRAM_ACTIVE`
- Cambiar split 40/60, hold 60 días, mínimo $200
- Migraciones destructivas
- Eliminar sistema legacy de comisiones
- Reescribir extensión o arquitectura financiera
