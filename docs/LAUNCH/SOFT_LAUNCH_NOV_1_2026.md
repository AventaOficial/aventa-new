# Soft launch — 1 de noviembre de 2026

**Modo:** comunidad abierta (feed, subir, plaza, perfil). **Dinero y recompensas monetarias: OFF.**

## Verificado automáticamente (2026-10-15)

| Check | Evidencia |
|-------|-----------|
| Código en `master` | #141 logos, #145 UI, #146/#147 seguridad |
| Migraciones PR143 en prod | `docs/SECURITY/PR143_PRODUCTION_APPLY_20261015.md` |
| `GET https://aventaofertas.com/api/health` | 200, `feedViewOk: true`, ~1416 ofertas en catálogo |
| Feed recientes prod | API devuelve ofertas |
| Ofertas `approved` (SQL prod, 15-oct PM) | **651** |
| Cola `pending` moderación (SQL prod) | **0** |
| OOS en vivo con health `out_of_stock` | **0** |
| Staging health + feed | OK (`staging.aventaofertas.com`) |
| **Vercel Production (`aventa-new`) — flags dinero** | `MONEY_PATH_FROZEN=true`, `REWARDS_PROGRAM_ACTIVE=true` (Fase A reconocimiento), `REWARDS_PAYOUT_ENABLED=false` |
| **Ledger prod** | `payout_intents=0` (lectura SQL) |
| **CI cierre** | Rama `launch/closure-20261015`: `ci:verify` + extensión + E2E en push a `master` |

## Pendiente del equipo (antes del 1 nov)

| # | Tarea | Responsable | Notas |
|---|--------|-------------|-------|
| 1 | Confirmar flags Vercel Production | Owner | **Hecho 15-oct:** freeze ON, programa ON (Fase A), payouts OFF — ver tabla arriba |
| 2 | **Moderación:** cola `pending` | Moderación | **0** al re-chequeo 15-oct PM; mantener SLA en lanzamiento |
| 3 | **Supabase Pro** + restore probado | Owner | Ledger `AVENTA_LAUNCH_READINESS.md` |
| 4 | Smoke **móvil** manual (15 min) | QA/Owner | Home Top/Recientes, Subir, Plaza, `/me/recompensas` (copy pausado), guía sin tab bar encima |
| 5 | Comunicación pública | Marketing | “Recompensas monetarias aún no disponibles” alineado con la app |
| 6 | DNS / dominio | Owner | `aventaofertas.com` apunta al deploy production actual |

## Script rápido (PowerShell)

```powershell
curl.exe -sS "https://aventaofertas.com/api/health"
curl.exe -sS "https://aventaofertas.com/api/feed/home?limit=5&view=latest&type=recent&period=week"
```

## GO / NO-GO

- **GO soft launch** si: checks verificados + moderación con plan + env prod con dinero OFF + backup en curso o aceptado como riesgo documentado.
- **NO-GO** si: feed roto, health `feedViewOk: false`, o se anuncian pagos sin `MONEY_REWARDS_GO_LIVE.md` completo.

## Cierre de producto (semana del 15 oct)

| # | Entrega | Estado |
|---|---------|--------|
| A | Modal recompensas opaco (`SheetFrame` sin `--me-card` en portal) | PR pendiente |
| B | Moderación: inteligencia de duplicados + ofertas parecidas en modo Focus | PR pendiente |
| C | MCP `check_offer_exists.catalogPrice` + prompt Grok (historial/precio) | PR + pegar prompt en xAI |
| D | Prueba económica con amigos | `MONEY_REWARDS_STAGING_ACTIVATION.md` en **staging** primero; prod solo con GO |
| E | Objetivo 10k usuarios mes 1 | Medir adquisición/activación/retención; no es criterio de GO técnico |

## Después del 1 nov (paso 5)

Ver `docs/LAUNCH/MONEY_REWARDS_STAGING_ACTIVATION.md` — primero staging, nunca saltar a prod sin GO de finanzas.
