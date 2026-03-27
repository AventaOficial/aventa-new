# Plan ejecutable de estabilización (sin romper producción)

Fecha inicio: 2026-03-27  
Owner sugerido: CTO/Founder  
Estado: **EN EJECUCIÓN**

---

## Objetivo

Garantizar que AVENTA opere de forma confiable y auditable sin dependencia de supervisión manual diaria, empezando por riesgos de dominio (categorías/contratos de datos), luego gamificación y monetización por niveles.

---

## Fase 0 — Guardrails automáticos (P0)

### Ya implementado

- [x] Unificación de categorías en capa de dominio (`lib/categories.ts`).
- [x] Soporte y separación de `category` macro vs `tags`.
- [x] Campo `bank_coupon` integrado en publicación y visualización.
- [x] Migración de unificación: `docs/supabase-migrations/categories_unification_bank_coupon_tags.sql`.
- [x] Checklist vivo: `docs/CHECKLIST_SISTEMA_VIVO.md`.
- [x] Documento maestro: `docs/DOCUMENTO_MAESTRO_AVENTA.md`.
- [x] **Cron de integridad automática**: `GET /api/cron/system-integrity`.
  - Revisa:
    - mapeo de categorías,
    - integridad `offers.category`,
    - integridad `offers.bank_coupon`,
    - disponibilidad de `ofertas_ranked_general`,
    - smoke test de feed home.
  - Si falla algo, responde **500** y loguea checks fallidos.
- [x] Programado en `vercel.json` cada 6 horas.

### Pendiente inmediato (siguiente iteración)

- [ ] Enviar alertas (Slack/Email/Webhook) cuando `system-integrity` devuelva 500.
- [ ] Registrar histórico de checks (tabla `system_integrity_runs`) para tendencias.
- [ ] Añadir playbook de incidentes con severidades y SLA.

---

## Fase 1 — Contratos y pruebas mínimas (P0/P1)

- [ ] Añadir suite de pruebas de contrato (categorías/feed/publicación).
- [ ] CI en pull requests:
  - `npm run lint`
  - `npm run build`
  - pruebas de contrato.
- [ ] Política de “no deploy” si falla Fase 0 o pruebas críticas.

---

## Fase 2 — Gamificación AVENTA (propia, no copia)

- [ ] Diseñar esquema:
  - `badge_definitions`
  - `user_badges`
  - `badge_events`
  - opcional `badge_progress`
- [ ] Mantener `reputation_level` para confianza/moderación.
- [ ] Separar visualmente:
  - **Confianza** (nivel reputación)
  - **Logros** (medallas)
- [ ] Definir primeras 8-12 medallas AVENTA y reglas cerradas.
- [ ] Anti-fraude: caps diarios + revisión de anomalías de votos.

---

## Fase 3 — Monetización por niveles

- [ ] Definir campos:
  - `offers.origin` (`aventa_editorial` | `community`)
  - `profiles.creator_tier`
  - `commission_ledger`
- [ ] Formalizar regla de negocio (texto y SQL):
  - nivel 1: tramo editorial (primeras 15 ofertas AVENTA).
  - nivel 2: 15 ofertas de comunidad con umbral de votos.
- [ ] Definir de forma inequívoca “120 votos”:
  - `up_votes >= 120` o `score >= 120` (elegir una).
- [ ] Ingesta de ingresos afiliados y conciliación por `ml_tracking_tag`.

---

## Fase 4 — Operación autónoma

- [ ] Dashboard único de estado (salud sistema + negocio).
- [ ] Alertas por:
  - feed vacío,
  - error rate API,
  - integridad de datos,
  - jobs cron fallidos.
- [ ] Reporte semanal automático de estabilidad y riesgos.

---

## Definición de “listo para confiar”

Se considera estable cuando:

- [ ] 30 días sin incidentes P0 en feed/publicación/categorías.
- [ ] Cron de integridad con éxito > 99%.
- [ ] CI bloqueando despliegues con fallos críticos.
- [ ] Reglas de gamificación y monetización versionadas + auditables.

---

## Registro de ejecución

| Fecha | Acción | Resultado | Responsable |
|---|---|---|---|
| 2026-03-27 | Activar cron `system-integrity` + guardrails | Completado | AI/Founder |
