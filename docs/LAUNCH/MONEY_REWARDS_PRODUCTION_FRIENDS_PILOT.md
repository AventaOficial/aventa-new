# Piloto económico en producción (amigos) — aventaofertas.com

**Objetivo:** probar recompensas de punta a punta (desbloqueo, términos, acumulación, saldos, y opcionalmente pago) en **producción**, con un grupo pequeño y controlado.

**No usar staging** para esta prueba si el negocio exige comisiones/atribución reales de retailers en el mismo entorno que verán los usuarios.

---

## Qué enciende qué (código actual)

| Variable (Vercel → **aventa-new** → Production) | Efecto |
|------------------------------------------------|--------|
| `REWARDS_PROGRAM_ACTIVE=true` | Desbloqueos nuevos (`reward_program_unlocked_at`), programa en estado ACTIVE, puente ledger→rewards. **Sin esto no hay economía real.** |
| `MONEY_PATH_FROZEN=false` | Permite crear/mover recompensas y operar payout intents. Con `true` (o ausente en prod = congelado) el motor no escribe dinero. |
| `REWARDS_PAYOUT_ENABLED=true` | Permite que la cohorte/programa marque pagos habilitados en UI y crons de payout (junto con descongelado). |
| `REWARDS_BETA_UI_ENABLED=true` | Solo UX/onboarding beta si el programa está OFF. **No sustituye** `REWARDS_PROGRAM_ACTIVE` para acumular. |

Con programa activo, **cualquier usuario** que cumpla requisitos puede desbloquear y aceptar términos, no solo amigos. El piloto es “producción real” con ese alcance; comunicad límites y monitoread.

---

## Secuencia recomendada (producción)

### Fase A — Solo reconocimiento (sin mover dinero)

1. Backup / snapshot Supabase y anotar SHA de deploy en Vercel.
2. En Production:
   - `REWARDS_PROGRAM_ACTIVE=true`
   - `MONEY_PATH_FROZEN=true` (explícito)
   - `REWARDS_PAYOUT_ENABLED=false`
3. Redeploy production (o esperar deploy de `master`).
4. Smoke con 2–3 cuentas de amigos:
   - `/me/recompensas` → progreso, modal términos, ceremonia, elegir oferta de bienvenida.
   - Confirmar que **no** aparecen montos pagables ni crons liberando saldo.
5. Rollback: `REWARDS_PROGRAM_ACTIVE=false`, redeploy.

### Fase B — Economía completa (acumulación + saldos)

1. Checklist legal: términos vigentes publicados, mensaje en app de que el programa está en prueba.
2. En Production:
   - `REWARDS_PROGRAM_ACTIVE=true`
   - `MONEY_PATH_FROZEN=false`
   - `REWARDS_PAYOUT_ENABLED=false` (primero solo acumular/validar)
3. Redeploy.
4. Con amigos: publicar oferta → compra de prueba real con enlace atribuido → esperar hold (`REWARDS_HOLD_DAYS`) o usar ofertas/crons de prueba según runbook interno.
5. Verificar en `/me/recompensas` y admin rewards que aparecen filas en validación/disponible.
6. Monitorear: `GET /api/health`, logs Vercel, cola moderación.

### Fase C — Pagos a amigos (opcional, máximo riesgo)

Solo si finanzas y legal aprueban SPEI/payout en prod:

- `REWARDS_PAYOUT_ENABLED=true` (con Fase B ya activa).
- Datos fiscales/identidad según flujo existente (`/api/me/commission-fiscal` gateado).
- Payout manual o cron según operación actual; **montos bajos** y lista cerrada de user IDs.

Rollback inmediato si algo falla:

```env
MONEY_PATH_FROZEN=true
REWARDS_PAYOUT_ENABLED=false
```

(Dejar `REWARDS_PROGRAM_ACTIVE` según si quieren seguir reconocimiento sin pagos.)

---

## Smoke HTTP (producción, solo lectura)

```powershell
curl.exe -sS "https://www.aventaofertas.com/api/health"
```

Sesión autenticada (amigo):

- `GET /api/me/rewards/status` → `programActive`, `moneyPathFrozen`, `claimPhase`, `terms`.
- `GET /api/me/rewards` → lista de recompensas (puede estar vacía al inicio).

---

## Admin útil

- Cohorte beta (UX extra, no reemplaza programa): `POST /api/admin/rewards/beta` (`invite` / `reenroll`) — requiere staff.
- Recompensas admin: `/admin/rewards`, payouts owner si aplica.

---

## Comunicación pública (mientras dura el piloto)

- Banner o copy: “Programa de recompensas en prueba con un grupo limitado; los montos pueden tardar en validarse; no es promesa de ingreso.”
- Si `REWARDS_PROGRAM_ACTIVE=true` sin restricción de usuarios, evitar decir “solo invitados” en legal si la UI permite a otros cumplir requisitos.

---

## Relación con soft launch 1 nov

- Comunidad abierta + piloto económico en prod es posible si monitoreáis y tenéis rollback.
- Meta **10 000 usuarios** en el primer mes es crecimiento; no depende de estas flags, pero activar dinero en prod aumenta riesgo operativo y legal — documentad GO de finanzas antes de Fase B/C.

Ver también: `docs/LAUNCH/MONEY_REWARDS_GO_LIVE.md`, `docs/LAUNCH/SOFT_LAUNCH_NOV_1_2026.md`.
