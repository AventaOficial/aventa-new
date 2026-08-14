# Política de comisiones a creadores (Aventa)

**Estado:** aprobado para implementación (2026-08-14) — split 40%, mínimo $200 MXN, hold 14d, modo dual  
**Fecha:** 2026-08-14  
**Alcance:** México primero; misma lógica replicable a otros países  
**Principio:** elegibilidad por calidad · pago por comisión afiliada atribuida · no tirar lo ya construido

**Código alineado:** `lib/commissions/*`, `run-monthly`, `/admin/commissions`, `/admin/creator-tags`, import CSV, `/api/me/commission-earnings`, migraciones `commissions_attributed_revenue.sql` + `profiles_amazon_tracking_tag.sql`.

---

## 1) Promesa en una frase

> Desbloqueás el programa con calidad (15 ofertas × ≥120 votos + términos + datos fiscales).  
> Cobrás el **40%** de las **comisiones afiliadas confirmadas** atribuibles a tu tag / tus ofertas.  
> Si no hay comisión atribuible, no hay pago por ese periodo.

---

## 2) Roles de cada señal (no mezclar)

| Señal | Sirve para | No sirve para |
|-------|------------|---------------|
| Reputación / nivel | Confianza, peso de voto, privilegios | Dinero |
| Votos / 15×120 | **Elegibilidad** (candado) | Monto del pago |
| Outbound / CTR | Ops, fraude, producto | Pago final (proxy opcional futuro) |
| Comisión Amazon/ML atribuida | **Monto a pagar** | — |
| Ledger + allocations | Contabilidad y admin | — |

---

## 3) Split y economía

| Concepto | Valor | Notas |
|----------|-------|-------|
| Share creador base | **40%** (4000 bps) | Política recomendada; configurable por país después |
| Share plataforma | **60%** | Impuestos, chargebacks, ops, ads, expansión |
| Base de cálculo | Comisión **confirmada** por la red (no clic, no estimado) | Amazon Associates / Mercado Libre Afiliados |
| Moneda | Centavos + `currency` (MXN en MX) | Multi-país: misma fórmula, otra currency |
| Mínimo de payout | **$200 MXN** (o equivalente local) | Si no llega, se acumula al siguiente periodo |
| Retención / hold | **14 días** tras cierre de periodo de red | Por devoluciones/cancelaciones |
| Sin tag / no atribuible | 100% plataforma | No entra al pago de creadores |

**Default técnico actual en código:** `creator_share_bps = 4000` (40%) y regla `attributed_revenue` (legacy por puntos sigue disponible).  
**Términos públicos:** `/terms` §8 y `/privacy` actualizados 2026-08-14 (`COMMISSION_TERMS_VERSION`).

---

## 4) Quién puede cobrar (elegibilidad) — se reutiliza tal cual

Un usuario puede recibir payout si cumple **todo**:

1. Programa públicamente activo (`COMMISSION_PROGRAM_ACTIVE`).
2. ≥ **15** ofertas `approved`/`published` con `upvotes_count ≥ 120` cada una.
3. Aceptó términos (`commissions_accepted_at` + versión vigente).
4. Perfil fiscal completo (nombre legal + RFC válido; CLABE requerida para marcar `paid` en flujo normal).
5. Sin flags bloqueantes (RFC duplicado, etc.).

**Importante:** cumplir el umbral **no genera** un pago fijo. Solo abre la puerta a cobrar lo atribuido.

---

## 5) Cómo se calcula el pago (norte)

```
para cada creador elegible en el periodo:
  attributed = suma(comisiones confirmadas ligadas a su tracking_tag / creator_id)
  bruto_a_pagar = floor(attributed * creator_share_bps / 10000)
  si bruto_a_pagar + carry < mínimo_payout → carry al siguiente mes
  si no → allocation pending = bruto_a_pagar + carry
```

### Atribución (orden de preferencia)

1. **Tag de creador** en el reporte de la red (ML `tag`, Amazon tracking ID) → `profiles.ml_tracking_tag` u equivalente Amazon.
2. Si el reporte trae sub-id / oferta → `offer_id` + `created_by`.
3. Si no hay match → ingreso **no atribuible** (se queda en plataforma; se registra en ledger igual).

### Qué no se paga

- Clics (`outbound`) solos.
- Votos / “puntos” de ofertas.
- Estimados de EPC.
- Comisiones `pending` o `void` de la red.
- Periodos dentro del hold de 14 días (se pueden **calcular** drafts, no marcar `paid` hasta liberar).

---

## 6) Calendario operativo (MX)

| Día / evento | Acción |
|--------------|--------|
| Continuo | Links de ofertas salen con tag del creador (o tag plataforma si no tiene). |
| Cuando la red publica reporte | Owner importa/registra montos en `affiliate_ledger_entries` (por red, periodo, ref). |
| Corte interno | Periodo calendario `YYYY-MM` (alineado a lo ya usado en pools). |
| +0–3 días post reporte estable | Generar **draft/locked** de allocations por creador atribuido. |
| +14 días hold | Revisar devoluciones; ajustar void/parcial si aplica. |
| Día de pago (ej. día 20–25 del mes siguiente) | SPEI manual a CLABE → marcar allocations `paid` → pool/periodo `paid`. |

**Pago bancario:** manual al inicio. Automatizar SPEI/PSP es fase posterior; no bloquea el modelo.

---

## 7) Qué ve el admin (apartado simple)

Una pantalla / periodo debe responder en 10 segundos:

1. **Ingresó** — bruto afiliado del periodo (por red: Amazon, ML, …).  
2. **Atribuible a creadores** vs **no atribuible**.  
3. **Pool / obligaciones** — 40% de lo atribuible (y detalle por usuario).  
4. **A pagar ahora** — listos (fiscal OK) vs bloqueados.  
5. **Ya pagado** / pendiente / void.  
6. **Neto plataforma** — bruto − pagado/pendiente creadores (antes de impuestos).

Por fila de creador:

- `display_name`, puntos legacy (opcional), **comisión atribuida**, **%**, **amount**, readiness, CLABE enmascarada, acciones `paid` / `void`.

---

## 8) Qué ve el creador (transparencia = menos reclamos)

En `/me` o `/comisiones`:

- Estado de elegibilidad (progreso 15×120).
- “Comisión atribuida este periodo (confirmada)” / “en hold”.
- “Tu share 40% → estimado a recibir”.
- Historial: pending → paid (fecha).
- Motivos si no cobra: no elegible, falta fiscal, bajo mínimo (acumulado), sin atribución.

Copy recomendado (público):

> Desbloqueás comisiones con calidad. Cobrás según las ventas afiliadas confirmadas que generan tus ofertas.

Evitar: “repartimos el 30% del mes entre todos por votos”.

---

## 9) Multi-país (listo para replicar, sin implementar todo ya)

Misma fórmula en todos lados:

`payout = attributed_commission × creator_share_bps`

| Global | Local por país |
|--------|----------------|
| Elegibilidad por calidad | Umbrales numéricos opcionales |
| Ledger + allocations + estados | Moneda, tax ID, método payout |
| Hold + mínimo | Montos en moneda local |
| Share base 40% | Override por país si hace falta |
| Redes afiliadas | Amazon/ML u otras del mercado |

No inventar un sistema distinto por país: solo conectores + compliance.

---

## 10) Mapa: lo que ya tenemos → qué se reutiliza → qué evoluciona

### Se conserva (no tirar)

| Pieza existente | Rol bajo esta política |
|-----------------|------------------------|
| `COMMISSION_REQUIRED_OFFERS` / `COMMISSION_MIN_UPVOTES_PER_OFFER` | Candado de elegibilidad |
| `commissionEligibility.ts` + UI `/me` | Sin cambio de concepto |
| Perfil fiscal + `evaluatePayoutReadiness` | Checklist de pago |
| `affiliate_ledger_entries` | Libro de ingresos de red |
| `commission_pools` + `commission_allocations` | Contenedor mensual + filas a pagar |
| `/admin/commissions` (generar, listar, marcar paid/void, tax estimate) | Cascarón de ops |
| `allocateByPoints` / run-monthly | **Temporal** o modo legacy; ver migración |
| `ml_tracking_tag` + `buildOfferUrl` | Base de atribución ML |
| `programStatus` / términos versión | Feature flag y legal |
| Pago manual SPEI + status `paid` | Ops fase 1 |

### Se evoluciona (cambios acotados, no rewrite)

| Cambio | Por qué | Impacto |
|--------|---------|---------|
| Añadir en ledger (o tabla hija) `creator_id` / `tracking_tag` / `offer_id?` / `attributable` | Pasar de “bruto plataforma” a “de quién es” | Migración SQL + import |
| Nueva regla de allocation: `amount = attributed × share` | Cumplir política §5 | Extender `monthlyPayout` / `run-monthly` |
| `creator_share_bps` default **4000** | Alinear a 40% | Constante + admin input ya existe |
| Modo de reparto: `legacy_points` \| `attributed_revenue` | No romper meses viejos ni demos | Flag en pool `meta` / notes |
| Admin: columnas “atribuido” vs “puntos” | Dueño ve la verdad | UI `/admin/commissions` |
| Creador: breakdown atribuido | Transparencia | `/me` CommissionProgramPanel |
| Amazon tracking id en perfil (además de ML tag) | Segunda red | Campo perfil + URL builder |
| Carry / mínimo $200 + hold 14d | Ops profesional | Campos en allocation o tabla carry |
| Import CSV por tag | Menos Excel | Fuente `csv_import` ya prevista en schema ledger |

### No hacer (aún)

- SPEI / PSP automático.
- Pagar por outbound o por votos.
- Tirar pools/allocations.
- Unificar reputación con dinero.
- Creator fund tipo “views”.

---

## 11) Plan de migración sin tirar lo hecho

### Fase A — Política + copy (sin romper cálculo)
- Documentar esta política (este archivo).
- Ajustar copy de `/comisiones` hacia “pago por comisión atribuida” cuando el modo nuevo esté listo; hasta entonces ser honestos con el modo activo.
- Mantener 15×120.

### Fase B — Atribución mínima viable
- Asegurar tag por creador elegible.
- Extender ledger entries con tag/creator cuando se carga el mes.
- Admin muestra: ingresó / atribuible / a pagar 40%.

### Fase C — Reparto nuevo al lado del viejo
- `run-monthly` acepta `rule: attributed_revenue` (default nuevo) y `rule: points_per_qualifying_offer` (legacy).
- Pools viejos intactos; meses nuevos usan atribución.
- Allocations siguen siendo la fila de pago (misma tabla).

### Fase D — Experiencia creador + multi-red
- Panel con atribuido / hold / pagado.
- Amazon ID + ML tag.
- Mínimo y carry.

### Fase E — Escala
- Import automático / API redes.
- Payout provider.
- Overrides por país.

---

## 12) Criterios de “listo para pasar a código”

Checklist antes de implementar:

- [ ] Owner aprueba split **40%** y mínimo **$200 MXN** y hold **14 días**.
- [ ] Se confirma: votos solo elegibilidad; dinero solo comisión atribuida.
- [ ] Se acepta migración por **modo dual** (legacy points + attributed), sin borrar tablas.
- [ ] Hay al menos un flujo manual: “cargar reporte ML por tag → ver a pagar”.
- [ ] Copy público no promete pool por votos si el modo nuevo está activo.

Cuando esto esté OK → implementar Fase B/C en código.

---

## 13) Resumen ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Pool por votos es el final? | No; es legacy / puente. |
| ¿Cómo paga YouTube en espíritu? | Umbral + % de lo que generó tu contenido. |
| ¿Cómo paga Aventa? | Umbral 15×120 + **40% de comisión atribuida**. |
| ¿Ana vs Beto? | Quien genera más comisión confirmada cobra más. |
| ¿Qué reutilizamos? | Elegibilidad, fiscal, ledger, pools, allocations, admin, tags. |
| ¿Qué cambiamos? | La **regla de cálculo del monto** + atribución en ledger. |
| ¿Tiramos todo? | No. |

---

*Documento base para implementación. Cualquier cambio de % / mínimo / hold debe actualizar esta página y `lib/commissions/constants.ts` en el mismo PR.*
