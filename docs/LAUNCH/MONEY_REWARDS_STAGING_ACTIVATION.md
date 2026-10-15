# Paso 5 — Activar dinero (solo staging primero)

No ejecutar en **producción** hasta completar esta lista en staging y obtener GO de finanzas/legal.

## Fase A — Staging (`aventa-staging` / `oojshofrpbfwsiypcecr`)

1. **Vercel → proyecto `aventa-staging` → Environment Variables (Preview o dedicated staging):**
   ```env
   REWARDS_PROGRAM_ACTIVE=true
   MONEY_PATH_FROZEN=false
   ```
   Mantener `COMMISSION_PROGRAM_ACTIVE=false` salvo prueba legacy aislada.

2. Redeploy staging tras cambiar env.

3. En máquina con `.env.staging.local` apuntando a staging (nunca prod):
   ```bash
   node scripts/verify-rewards-staging.mjs
   ```

4. Smoke manual (usuario de prueba):
   - `GET /api/me/rewards/status` → `programActive: true`, `moneyPathFrozen: false`
   - Desbloqueo / onboarding sin prometer pago inmediato
   - Admin: payout intent en sandbox (sin tocar prod)

5. Crons de dinero: revisar `vercel.json` y logs 24 h; confirmar que no hay movimiento no deseado.

## Fase B — Producción (solo con GO escrito)

1. `REWARDS_PROGRAM_ACTIVE=true`, **`MONEY_PATH_FROZEN=true`** (programa visible, dinero aún congelado) — observar 48 h.
2. Términos del programa publicados y comunicación.
3. `MONEY_PATH_FROZEN=false` en ventana acotada + monitoreo owner/finanzas.
4. Lo que **sigue fuera de código**: retiro self-service, fiscal Rewards V1 completo, proveedor de pagos productivo (ver `MONEY_REWARDS_GO_LIVE.md`).

## Qué no hace este documento

- No sustituye asesoría fiscal.
- No activa variables en Vercel por sí solo (requiere acceso owner al dashboard).
