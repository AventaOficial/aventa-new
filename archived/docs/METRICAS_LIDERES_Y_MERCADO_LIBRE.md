# Métricas para líderes / afiliados y Mercado Libre

Cómo conectar las métricas de ML (productos, categorías, etiquetas de seguimiento, ganancia estimada) con Aventa para ver qué ofertas generaron ventas y estimar ingresos por líder.

---

## 1. Qué tienes en ML (resumen)

- **Por producto:** nombre exacto, unidades vendidas, ventas, comisión %, ganancia estimada.
- **Por categoría:** categoría, unidades, comisión, ganancia.
- **Por etiqueta de seguimiento:** ej. `capitanjeshua`, `aventa` — clics, unidades vendidas, tasa de conversión, ganancia estimada.
- **Por fecha:** clics, unidades, conversión, ganancia por día.
- **Ventas no efectivas:** canceladas / por incumplimiento, comisión en riesgo.

Si los enlaces que se comparten desde Aventa llevan una etiqueta (ej. `aventa` o `aventa_capitanjeshua`), en ML puedes ver cuánto generó esa etiqueta. El reto es **saber qué oferta de Aventa corresponde a qué venta en ML** (mismo producto, misma fecha).

---

## 2. Opciones para “métrica especial por ofertas”

**A) Matching por nombre de producto**  
En Admin → Métricas, una sección “Líderes / ML” donde:
- Listas las ofertas de Aventa (título, tienda, categoría, fecha).
- Si tienes export o datos de ML por producto, **emparejar por similitud de título** (ej. “Báscula Digital Cocina…” en ML ≈ oferta “Báscula digital cocina 15 kg” en Aventa).
- Mostrar por oferta: “Posible match ML: X unidades, $Y ganancia estimada” (dato manual o importado).

Requiere: poder importar o pegar datos de ML (producto + ganancia) y un algoritmo de similitud (fuzzy match por título). No hay API pública de ML para traer esto automático.

**B) Etiqueta de seguimiento por oferta o por líder**  
- En Aventa, al generar el enlace afiliado a ML, incluir una etiqueta que identifique la oferta (ej. `aventa_oferta_<uuid>`) o al líder (`aventa_capitanjeshua`).
- En ML solo ves por etiqueta: “esta etiqueta generó X”. Para bajar a **oferta** necesitarías una etiqueta por oferta (muchas etiquetas en ML) o que el líder reporte “esta venta vino de esta oferta”.
- Variante: **una etiqueta por líder** (`aventa_leader_1`). En Aventa guardas “este usuario es líder X” y muestras en métricas: “Líder capitanjeshua: esta semana subió N ofertas, en ML su etiqueta generó $Y” (el $Y lo metes manual desde el dashboard de ML).

**C) Estimación solo con datos de Aventa (ya lo tienes)**  
- En Métricas por oferta ya tienes **Est. ingreso (MXN)** por comisión ML (9% electrónica, 14% resto) según categoría.
- Eso es una **estimación** si asumes que cada clic outbound podría convertirse en venta. No es dato real de ML, pero sirve para ver qué ofertas “pesan” más.

**Recomendación:**  
- **Corto plazo:** Reforzar la métrica por oferta que ya tienes (Est. ingreso) y, si quieres, una sección “Líderes” donde **tú cargas a mano** (o pegas desde ML) la ganancia por etiqueta o por producto; y opcionalmente un “match sugerido” por título de oferta ↔ nombre de producto ML.  
- **Mediano plazo:** Si ML ofrece API de reportes por etiqueta/producto, se podría hacer sync y mostrar “ganancia real ML” por oferta o por líder. Mientras tanto, el flujo manual (export ML → pegar o importar en Aventa) ya da valor.

---

## 3. Resumen

| Qué quieres | Qué hay hoy | Qué se puede hacer |
|-------------|-------------|--------------------|
| Ver cuánto generó una oferta (real ML) | Est. ingreso por oferta (por categoría) | Matching por nombre producto + import/pegado de datos ML |
| Ver cuánto generó un líder | — | Sección “Líderes”: asociar usuario a etiqueta ML y cargar ganancia por etiqueta (manual desde ML) |
| Trackear por oferta en ML | — | Usar etiquetas tipo `aventa_oferta_<id>` al generar enlaces (y luego cruzar en ML por etiqueta) |

Todo esto se puede documentar como “Métricas especiales por ofertas / líderes” y priorizar: primero import manual o matching por título; después automatización si existe API ML.

---

## 4. ¿Muchos líderes es problema?

No. Cada líder tiene su propia etiqueta en ML (ej. `aventa_capitanjeshua`, `aventa_otro`). En Aventa, al reemplazar los links de ofertas por la URL con parámetro de seguimiento, **solo se usa la etiqueta del creador de esa oferta**. Si la oferta es de un usuario sin `ml_tracking_tag`, el link se muestra tal cual (sin etiqueta). Si es de un líder, se añade su etiqueta. Mercado Libre permite muchas etiquetas; el dashboard muestra ganancia por etiqueta. Escalar a muchos cazadores/líderes solo implica tener más filas en "Métricas líderes" al pegar datos desde ML.
