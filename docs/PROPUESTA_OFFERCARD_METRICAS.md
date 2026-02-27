# Propuesta: OfferCard mobile + Resumidor de métricas admin

## 1. OfferCard — Cambios concretos para móvil

### Estado actual (mobile)
- Layout horizontal: imagen 35% (izq) + contenido 65% (der)
- Imagen h-100, votos debajo de la imagen
- Contenido: precio → título → tienda·fecha → autor → favoritos (esquina) → botones
- Compartir: absoluto bottom-right

### Problemas detectados
1. **Proporción desbalanceada**: 35% imagen + votos deja poco espacio para texto en pantallas pequeñas
2. **Votos en columna izquierda**: compiten visualmente con el contenido principal
3. **Botones apretados**: "Ir directo" y "Cazar oferta" en una fila pueden truncarse
4. **Favoritos y compartir**: posicionados de forma que pueden solaparse o quedar poco accesibles

### Propuesta de reestructuración (solo mobile, `md:` sin cambios)

Orden deseado:
1. Precio actual / precio original / -% descuento
2. Título del producto
3. Tienda • fecha
4. Cazado por [autor]
5. Botones Ir directo / Cazar oferta
6. Botón favoritos
7. Botón compartir

#### Opción A — Layout vertical en mobile (recomendada)
En `max-md`, cambiar a columna única:

```
┌─────────────────────────────────────┐
│ [Imagen full-width, aspect 4/3]     │
├─────────────────────────────────────┤
│ $99  $199  -50%                     │  ← 1. Precios
│ Producto ejemplo título              │  ← 2. Título
│ Tienda • hace 2h                    │  ← 3. Tienda·fecha
│ Cazado por @usuario                 │  ← 4. Autor
│ [Ir directo] [Cazar oferta]         │  ← 5. Botones CTA
│ [👍 12 👎]  [♡]  [↗]                │  ← 6. Votos + Favoritos + Compartir
└─────────────────────────────────────┘
```

**Cambios concretos en `OfferCard.tsx`:**
- Envolver el contenido en `flex flex-col md:flex-row` para que en mobile sea columna
- En mobile: imagen arriba con `w-full aspect-[4/3]` (o similar)
- Mover `VotesBlock` al final de la card en mobile, en una fila horizontal con favoritos y compartir
- Botones CTA en fila propia, full-width o `flex-1` para que no se aprieten
- Favoritos y compartir: en la misma fila que votos, alineados a la derecha

#### Opción B — Mantener horizontal pero reordenar
Si prefieres mantener imagen lateral:
- Mover votos al área de contenido (debajo de los botones CTA)
- Favoritos + compartir en fila inferior junto a votos
- Ajustar `min-w` y `gap` para evitar overflow

### Código sugerido (esqueleto para Opción A)

```tsx
// Estructura principal
<div className="flex flex-col md:flex-row ...">
  {/* Imagen: full-width en mobile, 35% en desktop */}
  <div className="w-full aspect-[4/3] md:w-[35%] md:min-w-[140px] md:aspect-auto md:h-36 ...">
    {/* imagen */}
  </div>

  <div className="flex flex-col flex-1 md:pl-4 ...">
    {/* 1. Precios */}
    <div className="flex items-baseline gap-2 ...">...</div>
    {/* 2. Título */}
    <h3 className="...">...</h3>
    {/* 3. Tienda • fecha */}
    <p className="text-xs ...">...</p>
    {/* 4. Autor */}
    {author && <Link ...>Cazado por {author.username}</Link>}
    {/* 5. Botones CTA */}
    <div className="flex gap-2 mt-2">
      {offerUrl && <button>Ir directo</button>}
      <button>Cazar oferta</button>
    </div>
    {/* 6. Votos + Favoritos + Compartir (solo mobile: fila; desktop: mantener actual) */}
    <div className="flex items-center justify-between mt-3 md:mt-0">
      <VotesBlock />
      <div className="flex items-center gap-1">
        <button>Favoritos</button>
        <button>Compartir</button>
      </div>
    </div>
  </div>
</div>
```

**Breakpoint:** usar `md:` (768px) para que tablet/desktop mantengan el diseño actual.

---

## 2. Métricas admin — Resumidor por día/semana/mes

### Estado actual
- Tabla detallada por oferta con: title, views, outbound, shares, ctr, score, score_final, created_at
- Filtro de período: Todo, 24h, 7 días, 30 días
- Orden por: outbound, shares, ctr, score_final
- Sin resumen agregado ni texto legible

### Propuesta de resumidor

#### 2.1 Bloque de resumen superior (nuevo)
Añadir un panel encima de la tabla con métricas agregadas del período seleccionado:

| Métrica | Descripción |
|---------|-------------|
| **Total vistas** | Suma de views en el período |
| **Total outbound** | Suma de clics "Ir directo" |
| **Total shares** | Suma de compartidos |
| **CTR global** | (outbound / vistas) × 100 |
| **Ofertas activas** | Cantidad de ofertas con al menos 1 view u outbound |
| **Top oferta** | Título de la oferta con más outbound (o la que lidera según orden) |

#### 2.2 Texto legible y resumido
- Sustituir números crudos por frases cuando tenga sentido, ej.:
  - "En las últimas 24h: 1,234 vistas, 89 clics directos (7.2% CTR)"
  - "Esta semana: 12 ofertas activas, 5,678 vistas en total"
- Formato de números: `toLocaleString('es-MX')` para miles
- Porcentajes con 1 decimal

#### 2.3 Estructura sugerida en la página

```
┌─────────────────────────────────────────────────────────────┐
│ Métricas por oferta                    [Período ▼] [Actualizar]
├─────────────────────────────────────────────────────────────┤
│ RESUMEN — Últimos 7 días                                    │
│                                                             │
│ 5,234 vistas  •  312 clics directos (6.0% CTR)  •  45 shares│
│ 18 ofertas activas  •  Top: "iPhone 15 Pro -50%"            │
├─────────────────────────────────────────────────────────────┤
│ Ordenar por: [Outbound ↓ ▼]                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ title          | views | outbound | shares | ctr | ...  │ │
│ │ ...            | ...   | ...      | ...    | ... | ...  │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 2.4 Estimación de ventas (opcional)
Si aplica a tu modelo de negocio:
- "Estimación de conversión": asumiendo un % de outbound que compra (ej. 2–5%), mostrar un rango
- Ej: "Si 3% de los clics compran: ~9 ventas estimadas esta semana"
- Requiere definir el % (configurable o fijo)

### Implementación técnica

**Datos:** Calcular agregados en el cliente a partir de `data` ya cargada:

```ts
// Ejemplo de agregados
const summary = {
  totalViews: data.reduce((s, r) => s + r.views, 0),
  totalOutbound: data.reduce((s, r) => s + r.outbound, 0),
  totalShares: data.reduce((s, r) => s + r.shares, 0),
  activeOffers: data.length,
  topOffer: sorted[0]?.title ?? null,
};
const globalCtr = summary.totalViews > 0
  ? ((summary.totalOutbound / summary.totalViews) * 100).toFixed(1)
  : null;
```

**UI:** Nuevo bloque `<section>` antes de la tabla, con:
- Título "Resumen" + etiqueta del período
- Grid o flex con las métricas
- Texto resumido en una línea
- Estilos coherentes con el resto del admin (gray-50/800, bordes, etc.)

---

## Resumen de archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `app/components/OfferCard.tsx` | Layout responsive: `flex-col` en mobile, reordenar bloques, votos/favoritos/compartir en fila inferior |
| `app/admin/metrics/page.tsx` | Bloque de resumen superior con agregados, texto legible, formato es-MX |

---

## Implementado (feb 2025)
- **OfferCard (Opción B):** Reestructuración del área de contenido en mobile. Imagen y votos sin cambios. Flujo vertical compacto: precio, título, tienda·fecha, autor, CTA, favoritos. Espaciado y tipografía ajustados para móvil.
- **Métricas admin:** Bloque de resumen superior (vistas, clics, CTR, ofertas activas, top). Bloque de estimación de afiliados con presets Amazon, Mercado Libre, AliExpress; inputs de conversión, comisión y ticket promedio; salidas: ventas estimadas, ingresos MXN, EPC.
