# Roadmap producto — AVENTA

Objetivo: **ser la mejor página de ofertas** y sentar las bases para **expansión a otros países**.

---

## Aplicado (comparativa y filtros)

- **Filtros claros:** Recomendado (calidad + novedad), Top (mejor puntuadas), Para ti, Recientes (solo lo nuevo). Línea de ayuda bajo los tabs.
- **Badge "Destacada":** Ofertas con `ranking_blend` alto muestran etiqueta "Destacada" (umbral configurable; sin dar puntos ni recompensas).
- **Explicación de niveles:** En la barra de reputación, "¿Qué es?" abre modal con los 4 niveles y qué aporta cada uno.
- **Icono logo:** Componente AventaIcon (A estilizada / flecha arriba) junto al texto AVENTA en loading, Hero y onboarding.
- **Filtro por tienda:** Selector "Tienda" en el feed (API `/api/stores`); aplica al feed y a la búsqueda por texto.
- **Búsqueda mejorada:** Búsqueda en título, tienda y descripción; resultados ordenados por `ranking_blend`.
- **Categorías:** Columna `category` en offers (migración `offers_category.sql`), vista con category, API y formulario guardan categoría, filtro "Categoría" en feed y búsqueda.
- **Herramientas de moderación:** Filtros (tienda, categoría, fecha desde/hasta, Risk alto); acciones en lote (aprobar / rechazar con motivo / marcar expiradas); historial por oferta (API `moderation-logs`, botón "Historial" en tarjeta).

---

## Próximos pasos (descubribilidad y UX)

1. **Categorías y filtros**
   - Hecho: filtro por tienda y por categoría. Para categorías, ejecutar `offers_category.sql` y volver a aplicar `view_ranking_blend.sql`.
   - Pendiente: filtros por rango de precio (día/semana/mes ya en Top).
   - Pendiente: extender antigüedad si hace falta.

2. **Búsqueda**
   - Hecho: título, tienda y descripción; orden por ranking_blend. Categoría se filtra con el selector.

3. **Publicación y moderación**
   - Hecho: filtros (tienda, categoría, fecha, Risk alto), acciones en lote (aprobar/rechazar/marcar expiradas), historial en tarjeta.
   - Pendiente: flujo de publicar oferta más claro y rápido.

4. **Métricas de impacto**
   - Ofertas: clicks/salidas (track-outbound), tiempo en oferta, ratio de votos.
   - Comentarios: likes, respuestas.
   - Uso interno para mejorar ranking y, más adelante, para **recompensa por impacto** (baja, por calidad).

---

## Expansión internacional (a futuro)

- **Idioma:** i18n (es como base; después inglés u otros según mercado).
- **Moneda y formato:** Precios y fechas según región (MXN, USD, EUR, etc.).
- **Legal y privacidad:** Versiones de Términos y Privacidad por país o idioma si aplica.
- **Producto:** Misma lógica (reputación, moderación, ranking_blend, Destacada); solo adaptar copy, moneda e idioma.

---

## Economía (después de confianza y sistema)

- No priorizar hasta que reputación, moderación y feed estén estables.
- Objetivo: **pagar por impacto**, **muy por abajo** — recompensar calidad e impacto real, no "subir de nivel para vender".
- Ver sección 10 de `docs/COMPARATIVA_AVENTA_VS_PROMODESCUENTOS.md`.
