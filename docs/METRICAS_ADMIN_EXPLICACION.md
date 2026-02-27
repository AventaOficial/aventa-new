# Explicación de las métricas (admin)

Esta página te sirve para ver el rendimiento de cada oferta y estimar ingresos de afiliados.

---

## Bloque "Resumen"

Agrupa los datos del **período elegido** (Todo, 24h, 7 días, 30 días):

| Dato | Qué significa |
|------|----------------|
| **Vistas** | Cuántas veces se contó una "vista" de la oferta (cuando entra en pantalla un tiempo mínimo). |
| **Clics directos** | Cuántas veces alguien pulsó "Ir directo" (salida a la tienda). |
| **CTR** | Porcentaje de vistas que terminaron en clic: (clics ÷ vistas) × 100. |
| **Compartidos** | Cuántas veces se usó el botón compartir. |
| **Ofertas activas** | Número de ofertas que tienen al menos 1 vista o 1 clic en ese período. |
| **Top** | La oferta que más destaca según el orden actual (por defecto por outbound). |

El texto del resumen es solo una lectura amigable de esos totales.

---

## Bloque "Estimación de afiliados"

Aquí **no** se ve el dinero real que te pagan las plataformas; es una **proyección** a partir de:

1. **Plataforma**  
   Presets (Amazon, Mercado Libre, AliExpress) que rellenan conversión y comisión típicas. "Personalizado" te deja poner cualquier %.

2. **Conversión %**  
   Qué parte de los **clics** (Ir directo) crees que acaba en **compra**. Ej.: 4% = de cada 100 clics, 4 compras.

3. **Comisión %**  
   Qué % te paga la plataforma por esa venta (según categoría; puedes usar tus tablas de ML/Amazon).

4. **Ticket promedio (MXN)**  
   Cuánto gasta de media quien compra por tu enlace (por pedido).

**Fórmula:**

- **Ventas estimadas** = Clics directos × (Conversión % ÷ 100)  
- **Ingresos estimados** = Ventas estimadas × Ticket × (Comisión % ÷ 100)  
- **EPC** (ganancia por clic) = Ingresos estimados ÷ Clics directos  

Todo es **estimado**: las plataformas te darán las ventas y comisiones reales en sus reportes.

---

## Tabla por oferta

Cada fila es **una oferta** con:

| Columna | Significado |
|--------|-------------|
| **title** | Título de la oferta. |
| **views** | Vistas en el período. |
| **outbound** | Clics en "Ir directo" en el período. |
| **shares** | Veces compartida. |
| **ctr** | CTR de esa oferta: (outbound ÷ views) × 100. |
| **score** | Puntos de votos (up − down). |
| **score_final** | Score ajustado por antigüedad (para ranking). |
| **created_at** | Fecha de creación. |

Puedes **ordenar** por outbound, shares, ctr o score_final y cambiar el **período** para ver distintos rangos de fechas.

**Actualizar métricas** refresca la vista materializada que usa la tabla (sobre todo cuando el período es "Todo").
