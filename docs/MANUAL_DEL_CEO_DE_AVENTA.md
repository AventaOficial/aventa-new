# Manual del CEO de AVENTA

**Versión:** 1.0  
**Fecha:** 2 de junio de 2026  
**Audiencia:** Fundador / CEO operador  
**Propósito:** Dirigir el negocio con los sistemas que ya existen — sin depender de memoria técnica.

---

## Cómo usar este documento

1. **Cada mañana (10–15 min):** ve a la sección [Rutina diaria](#fase-2--rutina-del-ceo).
2. **Cada lunes (45–60 min):** rutina semanal + revisar [Huecos y riesgos](#fase-3--huecos-métricas-ciegas-y-riesgos-sorpresa).
3. **Primer día hábil del mes (2–3 h):** rutina mensual + [Seguridad y continuidad](#fase-6--seguridad-y-continuidad).
4. Si algo “explota”, abre [Qué puede romper AVENTA](#qué-puede-romper-aventa-de-un-día-a-otro) antes de tocar código.

**Pantalla principal del fundador:** `/admin/owner` (Owner Dashboard).  
**Mapa del negocio en lenguaje humano:** bloque “Mapa de AVENTA” dentro del mismo panel (detalle colapsable).  
**Documento técnico de respaldo:** `docs/DOCUMENTO_MAESTRO_AVENTA.md` (para delegar a ingeniería).

---

## Fase 1 — Mapa de sistemas y áreas

### 1.1 Inventario de sistemas (lo que ya existe)

| Sistema | Qué hace | Dónde lo operas / ves |
|--------|----------|------------------------|
| **Feed y descubrimiento** | Muestra ofertas rankeadas; home, categoría, tienda, para ti | `/`, `/categoria/*`, `/descubre` |
| **Ofertas y detalle** | Ficha, CTA a tienda, cupones, comentarios | `/oferta/[id]` |
| **Publicación comunitaria** | Usuarios suben ofertas (pendientes de mod) | `/subir`, ActionBar |
| **Votos, favoritos, eventos** | Engagement + `view` / `outbound` / `share` | Cards, modal, APIs track |
| **Moderación humana** | Cola, aprobar/rechazar, reportes, baneos | `/admin/moderation`, `/admin/reports` |
| **Bot de ingesta** | Descubre e inserta ofertas (ML/Amazon) | Cron externo/manual `bot-ingest`, `/admin/operaciones` |
| **Afiliación (tags)** | Normaliza URLs con tags de red | Env + al aprobar oferta |
| **Ledger de afiliado** | Ingresos de red registrados manualmente | `/admin/commissions`, tabla `affiliate_ledger_entries` |
| **Comisiones a creadores** | Pools mensuales desde ledger + puntos | `/admin/commissions`, `/me` |
| **Owner Dashboard** | Estado del negocio, Founder Mode, economía, calidad | `/admin/owner` |
| **Economía estimada** | EPC = ledger ÷ clics; estimado día/semana/mes | Sección Economía en Owner Dashboard |
| **Salud de ofertas** | Revisa precio vivo / agotado (muestra) | Cron cada 4 h, sección Calidad |
| **Métricas de producto** | Retención 48h, activos, CTR por oferta | `/admin/metrics` |
| **Integridad automática** | Checks de BD (categorías, votos, precios incoherentes) | Cron + `/admin/health`, alertas |
| **Infraestructura (vista)** | Catálogo Vercel, Supabase, Resend, Redis… | Owner Dashboard → Infraestructura |
| **Mapa de AVENTA** | Flujos: usuarios, ofertas, mod, afiliación, ingresos, infra | Owner Dashboard → Mapa |
| **Operaciones / Go-No-Go** | Pulso operativo, cola de escritura | `/admin/operaciones`, `/operaciones` |
| **Auth y roles** | owner, admin, moderator, analyst | `/admin/team`, Supabase Auth |
| **Emails** | Digest diario/semanal, aprobación ofertas | Resend + crons digest |
| **Legal / términos** | Comisiones, privacidad | `/terms`, `/privacy` |

### 1.2 Clasificación estratégica

| Clasificación | Sistemas |
|---------------|----------|
| **Críticos** (si fallan, el negocio para) | Supabase (BD+auth), Vercel (hosting), feed+ofertas visibles, moderación mínima, tags afiliado en enlaces salientes |
| **Generan ingresos** | Afiliación, clics outbound, ledger, (futuro) conciliación; calidad de oferta → confianza → CTR |
| **Generan crecimiento** | Feed/ranking, votos, reputación, bot ingesta, `/descubre`, registros, retención |
| **Soporte** | Emails digest, logs mod, métricas analista, contexto doc, integridad, salud ofertas, infra catalog |

---

### 1.3 Mapa por área operativa

#### Producto

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Que el usuario encuentre ofertas creíbles y llegue a la tienda con un clic. |
| **Responsable ideal** | CEO (ahora) → Head of Product cuando exista tráfico sostenido. |
| **Frecuencia de revisión** | Semanal: CTR y top ofertas (`/admin/metrics`). Mensual: mix categorías y experiencia móvil. |
| **Riesgo si falla** | Menos clics → menos ingreso afiliado; reputación de “ofertas viejas o falsas”. |

#### Comunidad

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Usuarios que votan, comentan, suben ofertas y vuelven. |
| **Responsable ideal** | CEO / community lead part-time. |
| **Frecuencia** | Diario: registros y activos (Owner Dashboard). Semanal: retención 48h (`/admin/metrics`). |
| **Riesgo si falla** | Feed vacío de validación social; dependencia total del bot o del equipo. |

#### Moderación

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Solo publicar ofertas con enlace coherente, precio razonable y sin fraude/spam. |
| **Responsable ideal** | Moderador dedicado (o CEO <20 pendientes). |
| **Frecuencia** | Diario: cola pendiente + SLA 24h (Owner Dashboard). Semanal: rechazadas y reportes. |
| **Riesgo si falla** | Confianza de marca destruida; chargebacks de comunidad; problemas legales por enlaces. |

#### Afiliación

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Cada clic saliente lleve tag de red para que Amazon/ML (etc.) atribuyan comisión. |
| **Responsable ideal** | CEO + finanzas ligera. |
| **Frecuencia** | Semanal: programas activos (Founder Mode / Operaciones). Mensual: revisar panel de cada red. |
| **Riesgo si falla** | Tráfico sin ingreso medible; “AVENTA trabaja gratis”. |

#### Monetización

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Saber cuánto entra (real), cuánto podría entrar (estimado), cuánto repartir a creadores. |
| **Responsable ideal** | CEO → ops/finance hire. |
| **Frecuencia** | Semanal: ledger y EPC. Mensual: pools de comisiones y elegibilidad. |
| **Riesgo si falla** | Decisiones a ciegas; pagos incorrectos a creadores; burnout del fundador. |

#### Infraestructura

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Sitio arriba, BD sana, colas sin atasco, costos predecibles. |
| **Responsable ideal** | CTO / ingeniero senior fractional. |
| **Frecuencia** | Diario: alertas integridad (Owner). Semanal: write queue. Mensual: Supabase/Vercel. |
| **Riesgo si falla** | Caída total, pérdida de datos, moderación imposible. |

#### Seguridad

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Solo roles autorizados en admin; RLS en datos; secretos rotados. |
| **Responsable ideal** | CEO + ingeniero en releases sensibles. |
| **Frecuencia** | Mensual: accesos equipo (`/admin/team`). Trimestral: revisión RLS y env. |
| **Riesgo si falla** | Filtración de datos, abuso de APIs, toma de panel admin. |

#### Operaciones

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Ritmo predecible: mod, ingesta, salud de ofertas, imports de ledger, integridad. |
| **Responsable ideal** | COO o CEO con checklist. |
| **Frecuencia** | Diario: Owner Dashboard. Semanal: operaciones + métricas. Mensual: go-no-go mental. |
| **Riesgo si falla** | Incendios constantes; no escalas porque todo depende de ti. |

---

## Fase 2 — Rutina del CEO

### Rutina diaria (10–15 min)

Abrir **`/admin/owner`** y actualizar.

| Orden | Qué mirar | Decisión típica |
|-------|-----------|-----------------|
| 1 | **Founder Mode → Estado / Alertas** | ¿Hay rojo? Priorizar eso hoy. |
| 2 | **Acción recomendada** | Hacer esa acción (mod, ledger, operaciones…). |
| 3 | **Moderación** | Pendientes &lt; 10 verde; si ≥20, bloquear otras tareas y moderar. |
| 4 | **Clics (7d) + CTR** | ¿El feed convierte? Si CTR &lt;3% con volumen, revisar calidad de ofertas top. |
| 5 | **Economía** | Real mes vs estimado; leer **confianza** y motivo si “Sin estimar”. |
| 6 | **Calidad** | 🟡 precio cambió / 🔴 agotadas → plan: corregir, expirar o rechazar manualmente. |
| 7 | **Afiliación** | ML y Amazon con ✓ en Founder Mode. |

**No hace falta cada día:** métricas profundas, logs, infra detallada (solo si hay alerta).

---

### Rutina semanal (lunes, 45–60 min)

| Bloque | Pantalla / sistema | Pregunta que respondes |
|--------|-------------------|------------------------|
| 1 | Owner Dashboard (detalle completo) | ¿Cómo va la semana vs la anterior? |
| 2 | `/admin/metrics` (periodo 7d) | ¿Qué ofertas y categorías concentran clics? |
| 3 | `/admin/commissions` | ¿Importé comisiones de redes al ledger? |
| 4 | `/admin/moderation` + reportes | ¿Patrones de fraude o abuso? |
| 5 | `/admin/operaciones` o `/operaciones` | Integridad OK, bot, cola escritura. |
| 6 | Economía: EPC y ventana | ¿El estimado tiene sentido vs lo que ves en paneles de afiliados? |
| 7 | Calidad: acumulados 🟡🔴 | ¿Cuántas ofertas activas siguen sin revisión (`sin revisión aún`)? |

**Regla semanal:** si el ledger del mes sigue en $0 pero hay clics, **agendar 30 min** para copiar ingresos desde paneles Amazon/ML al ledger.

---

### Rutina mensual (primer día hábil, 2–3 h)

| Bloque | Actividad |
|--------|-----------|
| **Finanzas** | Cerrar mes: sumar comisiones reales por red → ledger; comparar con estimado mes; anotar EPC real vs EPC sistema. |
| **Comunidad** | Revisar crecimiento (registros 7d, retención 48h en métricas). |
| **Producto** | Top 10 ofertas del mes; ¿siguen vigentes? Usar calidad + moderación. |
| **Equipo y accesos** | `/admin/team` — ¿siguen siendo correctos los roles? |
| **Infra y seguridad** | Checklist Fase 6 (abajo). |
| **Estrategia** | Una página: ¿qué matamos, qué duplicamos, qué contratamos? Usar huecos Fase 3. |

---

## Fase 3 — Huecos, métricas ciegas y riesgos sorpresa

### 3.1 Lo que todavía NO estás midiendo bien

| Hueco | Por qué importa | Dónde duele hoy |
|-------|-----------------|-----------------|
| **Venta atribuida a oferta** | No sabes qué oferta generó comisión | No optimizas feed por ingreso, solo por clics |
| **Ingreso por usuario/creador** | No sabes quién te hace ganar dinero | Comisiones por puntos, no por revenue |
| **Conversión clic → compra** | EPC mezcla todo el tráfico | Economía estimada es proxy, no contabilidad |
| **Clics sin tag** | Parte del outbound no se etiqueta | Subestimas ROI de arreglar afiliación |
| **Cobertura salud ofertas** | ~150 checks/día vs catálogo completo | Ofertas largas cola sin revisar pueden estar muertas |
| **Churn de creadores** | No hay panel “quién dejó de publicar” | Comunidad se enfría sin que lo veas |
| **Costo por oferta / por clic** | Infra y tiempo mod no están en $ | No sabes margen unitario |
| **NPS / confianza usuario** | No hay encuesta sistemática | Riesgo reputacional tardío |

### 3.2 Lo que NO estás viendo en un solo lugar

- **Panel de redes afiliadas** (Amazon Associates, ML Afiliados) vs **ledger interno** — debes conciliar manualmente.
- **Ofertas con muchos clics pero precio cambiado** — empieza en Calidad, pero aún no hay cola de moderación por calidad.
- **Bot vs humanos** — cuánto del catálogo es ingesta automática vs comunidad (impacta riesgo y mod).

### 3.3 Riesgos que pueden sorprenderte

| Riesgo | Señal temprana en AVENTA | Mitigación CEO |
|--------|--------------------------|----------------|
| Ofertas mentirosas o precio falso | 🟡🔴 en Calidad, reportes, CTR bajo | Moderar; bajar prioridad en feed (futuro) |
| Ledger desactualizado | Estimado ≫ real o confianza baja | Import semanal |
| Tags afiliado rotos | Alerta roja afiliación | Revisar env en Vercel |
| Supabase lleno / caro | Lentitud, errores upload | Panel Supabase mensual |
| Cola escritura atascada | Alerta write queue | `/admin/operaciones` |
| Dependencia del fundador en mod | Cola &gt;24h constante | Contratar moderador |
| Cambio de TOS de Amazon/ML | Caída ingresos sin caída clics | Leer emails de redes |
| Un solo ingenero / sin backup | Bus factor | Doc maestro + acceso emergencia |

---

## Fase 4 — Equipo ideal por escala

### Hoy (fundador solo o casi solo)

**Tú haces:** CEO + moderación + finanzas ledger + producto prioritario.  
**Los sistemas hacen:** ranking, eventos, integridad, estimado EPC, muestra de salud, emails digest, bot (si está activo).

---

### ~100 usuarios activos / mes

| Rol (orden) | Por qué primero | Deja de hacerlo el fundador |
|-------------|-----------------|---------------------------|
| **Moderador part-time** | Cola y calidad son cuello de botella | Aprobar 20+ ofertas/día |
| **Ingeniero fractional (mantenimiento)** | Crons, migraciones, incidentes | Apagar fuegos técnicos |

**Sistemas siguen automatizando:** votos, feed, track clics, integridad, cron salud (muestra), EPC.

**Pasa a personas:** validación de precio/enlace, decisiones 🟡🔴, import ledger.

---

### ~1 000 usuarios activos / mes

| Rol adicional | Por qué |
|---------------|---------|
| **Ops / finanzas ligera** | Ledger semanal, conciliación redes, pools comisiones |
| **Community lead** | Creadores, disputas, campañas |
| **Producto (1)** | Feed, experimentos, mobile |

**Automatización:** ingesta bot, digest, alertas integridad.  
**Personas:** política de calidad, negociación redes afiliadas, soporte usuarios repetitivo.

---

### ~10 000 usuarios activos / mes

| Rol adicional | Por qué |
|---------------|---------|
| **CTO o lead backend** | Escala BD, colas, rate limits, seguridad |
| **Data / growth** | Atribución, experimentos, retención |
| **Moderación 24/7 o turnos** | SLA estricto |
| **Legal/compliance** | Términos, comisiones, datos |

**Dejan de ser solo automáticos (necesitan producto):** ingreso por oferta, reparto comisiones con auditoría, moderación por reglas de calidad en cola.

---

## Fase 5 — Centro de monetización (estado y roadmap)

### 5.1 Estado actual (honesto)

| Capacidad | Estado |
|-----------|--------|
| Tags en URLs salientes | ✅ Implementado (env + normalización al aprobar) |
| Conteo clics outbound | ✅ `offer_events` |
| Ingreso real en producto | ✅ `affiliate_ledger_entries` (manual) |
| Ingreso estimado (EPC) | ✅ Owner Dashboard (ledger ÷ clics) |
| Comisiones a creadores | ✅ Pools + elegibilidad (15 ofertas × 120 votos) |
| Ingreso por oferta | ❌ No existe |
| Ingreso por usuario | ❌ No existe |
| Conversión compra | ❌ No existe en BD |
| Payout automático | ❌ No; allocations son snapshot admin |

### 5.2 Roadmap (solo diseño, sin implementar)

**Fase M1 — Trazabilidad del dinero (fundacional)**  
- Import recurrente CSV/API de Amazon y ML al ledger (misma tabla, `source=csv_import`).  
- Conciliación mensual: ledger vs panel de red (hoja o pantalla admin).  
- KPI fijo: “días desde último import” en Owner Dashboard.

**Fase M2 — Atribución por oferta (decisiones de producto)**  
- Campo en ledger o tabla `revenue_attributions`: `offer_id`, `network`, `amount_cents`, `period`.  
- Requiere: parámetros en URL de afiliado o estimación estadística (peor caso).  
- Métrica: top ofertas por **ingreso**, no solo clics.

**Fase M3 — Ingreso por usuario / creador**  
- Vincular ofertas `created_by` con clics outbound de esas ofertas.  
- Modelo: % del ingreso atribuido a ofertas del usuario (reglas en contrato).  
- Panel en `/me` y admin: “ingreso generado” vs “comisión pendiente”.

**Fase M4 — Reparto seguro**  
- Ledger inmutable + pools con doble aprobación (draft → locked → paid).  
- Export para contabilidad; nada de “editar monto” sin log.  
- Integración pagos (SPEI/PayPal) solo después de M1–M3 estables.

**Orden recomendado:** M1 → M2 → M4 parcial → M3 (M3 depende de política comunitaria clara).

---

## Fase 6 — Seguridad y continuidad

### 6.1 Stack crítico y qué revisar

| Servicio | Uso en AVENTA | Revisión mensual (dueño) |
|----------|---------------|---------------------------|
| **Vercel** | Hosting, crons declarados | Factura, límites Hobby/Pro, crons ejecutándose (logs), variables de entorno |
| **Supabase** | BD, auth, storage imágenes | Uso disco, backups, RLS, usuarios service role, migraciones aplicadas |
| **Resend** | Emails mod/digest/alertas | Cuota, dominio verificado, rebotes |
| **Redis (Upstash)** | Rate limiting (si está activo) | Cuota, latencia, ¿sigue en env? |
| **Crons** | digest, integridad, salud ofertas | `vercel.json` + logs; `CRON_SECRET` rotado si hubo filtración |
| **APIs afiliadas** | Solo vía paneles web de redes | Sesión activa, cambio de tag, compliance |

**Crons en repo (`vercel.json`):**  
`daily-digest` (01:00 UTC), `system-integrity` (02:30 UTC), `offer-health-scan` (cada 4 h), `weekly-digest` (lunes 00:00 UTC).  

**Crons en código pero no en `vercel.json`:** `bot-ingest`, `process-write-queue`, `bot-ingest-candidates` — confirmar cómo se disparan en producción (manual, otro scheduler o pendiente).

### 6.2 Qué puede romper AVENTA de un día a otro

1. **Supabase caído o sin crédito** → todo para.  
2. **Vercel deploy roto** → sitio caído.  
3. **Env vars borradas** (Supabase URL, keys, tags afiliado) → auth o ingresos muertos.  
4. **RLS mal configurado** → datos expuestos o APIs vacías.  
5. **Cola `write_jobs_queue` llena de fallos** → eventos/clics no persisten.  
6. **Migración no aplicada** (ledger, health) → dashboards mienten o crons fallan.  
7. **Rate limit / abuso** → APIs bloqueadas para usuarios legítimos.

### 6.3 Respaldos y procesos que faltan (checklist dueño)

| Proceso | Estado típico | Acción recomendada |
|---------|---------------|-------------------|
| Backup BD Supabase | Depende del plan | Activar PITR/backups; probar restore 1×/año |
| Export ledger + pools | Manual | CSV mensual guardado fuera de Supabase |
| Runbook incidente | Parcial (docs dispersos) | Una página: “sitio caído → X” |
| Rotación secretos | Ad hoc | Calendario trimestral CRON_SECRET, service role |
| Acceso emergencia | Solo fundador | Segundo admin de confianza con rol owner backup |
| Conciliación ingresos | Manual | Plantilla mensual red vs ledger |

---

## Apéndice A — Tablero de mando (una página)

```
¿Negocio sano hoy?
  Owner Dashboard → semáforo Founder Mode

¿Puedo pagar / invertir?
  Economía → Real (ledger) + Estimado (EPC) + Confianza

¿El catálogo es creíble?
  Calidad → 🟢 🟡 🔴 + sin revisión

¿La máquina técnica aguanta?
  Alertas integridad + write queue + Infraestructura

¿La comunidad crece?
  Registros 7d + retención 48h (métricas)

¿Hay fuego?
  Cola moderación + reportes
```

---

## Apéndice B — Rutas rápidas del fundador

| Necesito… | Ir a… |
|-----------|--------|
| Panorama del día | `/admin/owner` |
| Moderar | `/admin/moderation` |
| Registrar ingresos red | `/admin/commissions` |
| Profundizar clics | `/admin/metrics` |
| Salud técnica BD | `/admin/health` |
| Operaciones / bot | `/admin/operaciones` |
| Equipo y roles | `/admin/team` |
| Contexto largo | `/contexto` |

---

## Apéndice C — Glosario CEO

| Término | Significado en AVENTA |
|---------|----------------------|
| **Outbound** | Clic “ir a tienda” medido en `offer_events` |
| **Ledger** | Libro mayor manual de comisiones de redes (`affiliate_ledger_entries`) |
| **EPC** | Ingreso ledger ÷ clics (estimación, no factura) |
| **Pool** | Reparto mensual a creadores desde ingreso plataforma |
| **SLA mod** | Objetivo ~24h desde publicación a aprobación |
| **Salud 🟢🟡🔴** | Verificación automática de precio/stock en tienda (muestra) |

---

## Apéndice D — Commit de referencia (economía + salud)

Implementación MVP en producción tras deploy: commit `4b40565` — economía estimada + `offer_health_state` + cron cada 4 h.

**Pasos manuales post-deploy si aún no los hiciste:**  
1. Ejecutar `docs/supabase-migrations/offer_health_state.sql` en Supabase.  
2. Verificar cron `offer-health-scan` en logs Vercel tras 4–6 h.

---

*Este manual describe el negocio tal como está construido en junio de 2026. Cuando el producto cambie, actualiza solo las tablas de rutinas y el Apéndice A — no reescribas todo el documento.*
