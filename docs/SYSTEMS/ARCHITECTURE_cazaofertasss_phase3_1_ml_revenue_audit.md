# CAZAOFERTASSS — FASE 3.1 AUDIT (Mercado Libre Afiliados Revenue)

Estado: **BLOQUEADO — sin fuente oficial utilizable para ingestión automatizada.**

Fecha de auditoría: 2026-09-19.  
Checkpoint código: `ce6365c` + FASE 3 contract local uncommitted.  
Decisión: **no implementar adapter** hasta disponer de documentación/credenciales/formato verificables.

## Resumen ejecutivo

Mercado Libre documenta el **Programa de Afiliados y Creadores** vía Central (UI):
generación de links, etiquetas y sección **Métricas**.  

**No** se encontró, en documentación pública oficial de Developers ni en help de Afiliados MX/AR/BR:

- API de afiliados para clicks / órdenes / comisiones
- schema de export CSV/XLSX
- webhook de ventas afiliado
- endpoint documentado de “affiliate earnings”

Por tanto FASE 3.1 **no puede** mapear un reporte real → `RawRevenueRecord` sin inventar campos.

## Fuentes oficiales consultadas

| Fuente | URL / ámbito | Hallazgo relevante |
|--------|----------------|-------------------|
| Cálculo de ganancias (MX) | https://www.mercadolibre.com.mx/l/como-se-calculan-tus-ganancias | Ventana 24h last-click; validación post-entrega; cancelaciones/devoluciones; pago vía Mercado Pago (mín. documentado localmente) |
| FAQ Afiliados (AR) | https://www.mercadolibre.com.ar/l/primeros-pasos-preguntas-frecuentes-afiliados | Links vía Barra / Central / Generador; **etiquetas**; Métricas (ganancias verificadas, ventas aprobadas, campañas); actualización ~24h |
| Etiquetas (MX) | https://www.mercadolibre.com.mx/l/primerospasos-organiza-tus-links | Etiqueta = agrupación de links; máx. 100; ≤30 chars; sin espacios/especiales; no eliminables; análisis en Métricas |
| Métricas (BR, análogo) | https://www.mercadolivre.com.br/l/acompanhe-suas-metricas | Filtro por etiquetas; períodos ≤180 días; ganancias confirmadas; ventas brutas/aprobadas; clics (móvil = subset) |
| Developers ML “afiliados” | https://developers.mercadolibre.com/…/afiliados | Portal genérico por país; **sin** referencia usable a API de comisiones afiliado en resultados públicos |
| Billing / payments API | developers.mercadolibre.com reportes de pagos/facturación | Ámbito **vendedor**, no Programa de Afiliados |
| Mercado Pago sales report | developers.mercadopago.com reports/sales-report | Split marketplace / sellers vinculados — **no** afiliados |

## Qué se sabe (documentado) vs qué falta

### 1) Cómo se obtiene la información

| Dato | ¿Documentado? | Mecanismo oficial conocido |
|------|---------------|----------------------------|
| Clicks | Parcial (métricas UI) | Dashboard Métricas |
| Órdenes / ventas | Parcial (ventas brutas / aprobadas en UI) | Dashboard Métricas |
| Comisión / ganancias | Parcial (ganancias verificadas/confirmadas) | Dashboard Métricas |
| Estado (aprobada / en revisión) | Conceptual (validación 60 días, cancelaciones) | Help de ganancias; **sin** enum de API |
| Cancelaciones / reversiones | Conceptual (afectan ingresos) | Help; **sin** evento exportable documentado |
| Tracking | Sí (etiquetas + params de link) | Etiquetas en Central; `matt_word` / `matt_tool` en URLs afiliadas (marcadores públicos en links) |
| Fecha | UI (períodos hasta 180 días) | Dashboard; **sin** schema de campo |
| Moneda | Implícita por sitio (MXN en MX) | Help MX habla en MXN; **sin** campo export |

### 2) Canal de adquisición

| Canal | ¿Oficialmente usable para ingestión? |
|-------|--------------------------------------|
| API Affiliates | **No documentada** públicamente |
| Dashboard Métricas | Sí para humanos; **no** hay contrato máquina |
| CSV / XLSX export | **No documentado** (campos/URL/proceso) |
| Exportación manual | Posible en UI, pero **sin schema oficial** ⇒ no mapeable sin inventar |
| Webhook | **No documentado** para afiliados |
| Scraping del dashboard | **Prohibido** por reglas CazaOfertasss |

### 3) Cadena de identidad Telegram → revenue

Diseño CazaOfertasss (FASE 3):

```
publicationIdentityKey
  → trackingLabel (caza_*)
  → affiliate URL (matt_word / matt_tool / etiqueta ML)
  → reporte proveedor
  → RawRevenueRecord.trackingIdentifier
  → attribution
```

**Puente teórico con ML (parcialmente documentado):**

- Al crear links en Central, se pueden usar **etiquetas** (≤30 chars, alfanumérico).
- Los links afiliados públicos llevan `matt_tool` y/o `matt_word` (marcadores ya usados en `affiliate.ts`).

**Hueco crítico:** no hay documento oficial que diga:

1. qué columna/campo de Métricas o export contiene la etiqueta / `matt_word` / `matt_tool`;
2. qué ID externo de venta/comisión exporta ML;
3. cómo distinguir pending vs approved vs cancelled a nivel de fila.

Sin eso, **no** se puede conectar de forma verificable `trackingLabel` ↔ evento de revenue.

### 4) Credenciales staging

En el entorno local auditado (nombres de env vars): **no** hay `CAZAOFERTAS_ML_*`, access token ML affiliates, ni client secret afiliados.  
`programmaticLinkGenerationAvailable: false` permanece en el dominio.

## Decisión FASE 3.1

| Fase | Estado |
|------|--------|
| A — Auditoría | **COMPLETA** |
| B — Adapter | **NO implementado** (falta fuente oficial) |
| C — Import batch | **NO implementado** |
| D — Staging DDL/canary | **NO ejecutado** |
| E — Tests provider | **NO agregados** (contrato FASE 3 ya cubre pipeline genérico) |
| F — Secrets | N/A (no hay integración) |

## Qué se necesita para desbloquear (checklist externo)

1. **Documento oficial** (Developers o help) que describa:
   - mecanismo de obtención máquina-a-máquina **o** export archivo con **lista de columnas**;
   - semántica de estados (pending / approved / cancelled / reversed);
   - identificadores de tracking presentes en cada fila.
2. Confirmación de que el export/API aplica al **Programa de Afiliados y Creadores MX**, no a billing de vendedor.
3. Credenciales **staging** (nombres de env vars + valores en secret store), nunca producción.
4. Muestra anonimizada de 1–3 filas reales (o fixture oficial) para mapear → `RawRevenueRecord` sin inventar.
5. Decisión explícita de aplicar DDL FASE 3 a staging **después** de tener (1)–(4).

## Relación con FASE 3

El contrato provider-neutral (`RawRevenueRecord` → ledger → attribution) **permanece válido**.  
El stub `createUnsupportedMercadoLibreAffiliatesSource()` es la respuesta correcta hoy.

No se modifica el contrato financiero por incompatibilidad documentada (no hay contrato de proveedor que lo fuerce).
