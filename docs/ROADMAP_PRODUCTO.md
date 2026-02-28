# Roadmap producto — AVENTA

Objetivo: **ser la mejor página de ofertas** y sentar las bases para **expansión a otros países**.

---

## Aplicado (comparativa y filtros)

- **Filtros claros:** Recomendado (calidad + novedad), Top (mejor puntuadas), Para ti, Recientes (solo lo nuevo). Línea de ayuda bajo los tabs.
- **Badge "Destacada":** Ofertas con `ranking_blend` alto muestran etiqueta "Destacada" (umbral configurable; sin dar puntos ni recompensas).
- **Explicación de niveles:** En la barra de reputación, "¿Qué es?" abre modal con los 4 niveles y qué aporta cada uno.
- **Icono logo:** Componente AventaIcon (A estilizada / flecha arriba) junto al texto AVENTA en loading, Hero y onboarding.
- **Filtro por tienda:** Selector "Tienda" en el feed (API `/api/stores`); aplica al feed y a la búsqueda por texto.

---

## Próximos pasos (descubribilidad y UX)

1. **Categorías y filtros**
   - Filtro por tienda: hecho (selector en feed + búsqueda).
   - Categorías en ofertas (ya existe campo en formulario); filtrar por categoría en home.
   - Filtros por rango de precio y antigüedad (día/semana/mes ya en Top; extender si hace falta).

2. **Búsqueda**
   - Búsqueda por título, tienda, categoría (y si aplica descripción) con resultados ordenados por relevancia o por ranking_blend.

3. **Publicación y moderación**
   - Flujo de publicar oferta más claro y rápido.
   - Herramientas para mods: filtros por fecha/autor, acciones en lote (aprobar/rechazar varias), historial de acciones.

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
