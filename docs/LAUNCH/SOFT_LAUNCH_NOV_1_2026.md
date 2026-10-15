# Soft launch — 1 de noviembre de 2026

**Modo:** comunidad abierta (feed, subir, plaza, perfil). **Dinero y recompensas monetarias: OFF.**

## Verificado automáticamente (2026-10-15)

| Check | Evidencia |
|-------|-----------|
| Código en `master` | #141 logos, #145 UI, #146/#147 seguridad |
| Migraciones PR143 en prod | `docs/SECURITY/PR143_PRODUCTION_APPLY_20261015.md` |
| `GET https://aventaofertas.com/api/health` | 200, `feedViewOk: true`, ~1416 ofertas en catálogo |
| Feed recientes prod | API devuelve ofertas |
| Ofertas vivas aprobadas/publicadas | **333** (SQL prod) |
| OOS en vivo con health `out_of_stock` | **0** |
| Staging health + feed | OK (`staging.aventaofertas.com`) |

## Pendiente del equipo (antes del 1 nov)

| # | Tarea | Responsable | Notas |
|---|--------|-------------|-------|
| 1 | Confirmar en **Vercel → aventa-new → Production**: `REWARDS_PROGRAM_ACTIVE` ausente o `false`; `MONEY_PATH_FROZEN` **`true` explícito** | Owner | Sin esto prod sigue fail-closed, pero conviene dejarlo explícito |
| 2 | **Moderación:** cola `pending` en prod (**217** al 15-oct) | Moderación | Definir meta: vaciar críticos o lanzar con SLA claro |
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

## Después del 1 nov (paso 5)

Ver `docs/LAUNCH/MONEY_REWARDS_STAGING_ACTIVATION.md` — primero staging, nunca saltar a prod sin GO de finanzas.
