# Feedback de beta, roadmap y filtros — AVENTA

**Para qué sirve este doc:** Tener todo el contexto de encuestas, estado del roadmap y cómo funcionan los filtros (nosotros vs referentes) en un solo sitio. Así quien retome el proyecto (o Jafet más adelante) no depende de memoria ni de chats sueltos.

---

## 1. Encuesta reciente (resumen)

**Preguntas y respuestas:**

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Qué crees que es Aventa en 30 segundos? | Una app para recomendar productos a mejores precios comparándolos con otras páginas |
| 2 | ¿Qué crees que puedes hacer aquí? | Publicar alguna buena oferta |
| 3 | ¿Te perdiste en algún punto? | No |
| 4 | ¿Algo fue confuso? | Nada |
| 5 | ¿Algo tardó demasiado? | No |
| 6 | ¿Subiste una oferta? ¿Por qué sí o no? | No, porque no tenía ningún producto que recomendar |
| 7 | ¿Votarías ofertas regularmente? | Sí |
| 8 | ¿Entrarías diario? ¿Por qué? | No diario pero sí estaría al pendiente de vez en cuando |
| 9 | ¿Usarías esto en vez de buscar ofertas en otro lado? | Sí |
| 10 | ¿Qué tendría que pasar para que lo uses seguido? | Nada, ya es muy bueno así |

**Qué nos dice esta encuesta (resumen del análisis tipo ChatGPT):**

- **Comprensión:** Entendió el producto en 30 segundos (recomendación de productos a buenos precios / comparación). No es exactamente “comunidad para descubrir y compartir ofertas”, pero está cerca y es positivo.
- **Flujo mental:** “Publicar alguna buena oferta” → el concepto de subir ofertas se entendió.
- **Fricción técnica:** No se perdió, nada confuso, nada tardó → la UX base funciona para beta.
- **Patrón espectador:** “No subí porque no tenía nada que recomendar” → repite el patrón: la mayoría será consumidora, no creadora (normal en comunidades: 90% mira, 9% interactúa, 1% crea).
- **Retención:** “No diario pero sí al pendiente de vez en cuando” → realista; así funcionan también Promodescuentos, Slickdeals (entran cuando quieren comprar, con notificación o aburrimiento).
- **Sustitución:** “Sí usaría esto en vez de buscar en otro lado” → el producto resuelve un problema real.
- **Uso seguido:** “Nada, ya es muy bueno así” → no hay fricción fuerte que lo aleje; no implica que volverá diario, pero es buen punto de partida.

**Riesgo que se repite:** Si mañana entra y ve lo mismo (poco contenido nuevo), no volverá por el producto en sí sino por falta de novedad. El reto sigue siendo **contenido y frecuencia de ofertas**, no UX técnica.

---

## 2. Comparada con las demás encuestas: patrón y qué vamos arreglando

**Patrón que confirman varias encuestas:**

| Área | Resultado |
|------|-----------|
| Comprensión | Buena |
| UX / navegación | Buena |
| Confusión | Baja |
| Fricción técnica | Baja |
| Motivación para crear (subir ofertas) | Baja |
| Motivación para consumir (votar, ver, usar en vez de otro sitio) | Alta |

Eso encaja con una comunidad de ofertas: muchos consumen, pocos crean. No hay que forzar a todo el mundo a subir ofertas.

**Qué vamos arreglando / priorizando según feedback previo:**

- **“No sabía qué hacer” / “me perdí”** → Ya tenemos tabs claros (Recomendado, Top, Para ti, Recientes), línea de ayuda bajo los tabs y texto tipo “Calidad + novedad”, “Mejor puntuadas en el período”. Esta encuesta dice “no me perdí” → vamos bien.
- **“No subí oferta porque…”** → No es fallo de producto; es el patrón espectador. Seguimos con ofertas de testers (home con ejemplos) y digest (Top 10, resumen semanal) para que haya algo que ver y enganche.
- **CTR 0% / nadie daba clic a tienda** → Métricas de ofertas ahora se calculan con API con service role para que los clics “Cazar oferta” se cuenten bien; el siguiente paso es contenido y claridad del valor, no solo técnico.
- **“¿Qué es esto?” / identidad de marca** → En la guía está como punto a pulir (diseño ~75%); cuando haya más feedback se puede afinar mensaje y primer impacto.

**Métrica útil (sugerida en el análisis):** De todos los testers, ¿cuántos han dicho algo tipo “avísame cuando la lances” o “quiero seguir usándola”? Ese número es una señal fuerte de intención. Se puede anotar en una hoja o en Admin cuando alguien lo diga.

---

## 3. Roadmap: qué tenemos y qué toca ahora

**Ya tenemos (resumen):**

- Feed con **Recomendado** (ranking_blend), **Top** (mejor puntuadas en período), **Para ti**, **Recientes**.
- **Período en Top:** Hoy / Semana / Mes (igual que referentes).
- Filtros por **tienda** y **categoría**; búsqueda en título, tienda, descripción.
- Badge **Destacada** (ranking_blend alto); reputación con niveles y modal “¿Qué es?”.
- Moderación con filtros, acciones en lote, historial por oferta.
- Métricas de producto (retención 48h, activos 24h, mejor hora, vistas/clics por oferta); Admin Logs y Usuarios con datos reales.
- Producción verificada (Vercel, Supabase, Google OAuth).

**Pendiente antes de abrir a más gente (checklist en GUIA):**

1. **Privacidad:** Poner correo real de contacto en `/privacy`.
2. **Prueba punta a punta:** Hacer el flujo completo (registro → subir oferta → votar → comentar → reportar → moderar) al menos una vez.
3. (Opcional) Filtro por rango de precio; flujo de publicar oferta más claro/rápido (viene en roadmap de producto archivado).

**Qué toca ahora (prioridad):**

- Cerrar los dos puntos anteriores (correo legal + prueba E2E).
- Seguir con beta: más testers, más ofertas, observar retención 48h y CTR.
- Contenido y novedad: que al entrar “de vez en cuando” vean ofertas nuevas (digest, notificaciones, más gente subiendo).

El roadmap de producto detallado (filtros por precio, internacional, economía) está en `archived/docs/ROADMAP_PRODUCTO.md`; para el día a día basta esta guía y este doc.

---

## 4. Cómo funcionan los filtros: Promodescuentos vs AVENTA

**Promodescuentos (referente):**

- **Recomendado:** Vista principal “recomendada” (lógica propia de ellos).
- **Top:** Mejor puntuadas **en el período elegido**. No se repiten en el sentido de que son justo las más votadas en ese período.
- **Período:** Hoy | Semana | Mes (selector junto a Top).
- **Para ti:** Feed personalizado (según usuario).
- **Recientes:** Lo más nuevo.

Cada pestaña es una vista distinta; Top = ranking por votos en la ventana de tiempo seleccionada.

**AVENTA (lo que tenemos):**

| Tab | Qué hace | Período |
|-----|----------|--------|
| **Recomendado** | Orden por `ranking_blend` (calidad + novedad ponderados). Solo ofertas creadas en el período (día/semana/mes según timeFilter). | Sí: mismo timeFilter que el resto |
| **Top** | Mejor puntuadas en el período: `score_final` desc, solo con score > 0. **Período visible:** Hoy / Semana / Mes (solo se muestra cuando estás en Top). | Sí: Hoy / Semana / Mes |
| **Para ti** | Priorizado por afinidad: ofertas de la misma **categoría o tienda** que las que has guardado en favoritos o votado. API `/api/feed/for-you`. | Filtros tienda/categoría opcionales |
| **Recientes** | Solo lo más nuevo por fecha de publicación. | Mismo timeFilter |

En **Top** no “se repiten” las mismas ofertas de forma rara: son las mejor puntuadas **en ese período**. Si eliges “Hoy” ves las más votadas de hoy; “Semana” las de la semana; “Mes” las del mes. Igual que la idea de Promodescuentos.

**Diferencia de UI:** En Promodescuentos el selector “Período: Hoy / Semana / Mes” puede estar siempre visible o asociado al Top. En AVENTA el selector “Período: Hoy / Semana / Mes” **solo se muestra cuando el usuario está en la pestaña Top**, para no cargar la barra de filtros en las otras vistas.

---

## 5. Contexto para quien retome el proyecto

- **Objetivo de producto:** Ser la mejor página de ofertas (México primero) y sentar bases para expansión.
- **Fase actual:** Beta privada (~20 personas). Métrica norte: retención 48h.
- **Documento único de estado y checklist:** `docs/GUIA_AVENTA.md`.
- **Este doc:** Feedback de encuestas, patrón de respuestas, qué estamos mejorando, roadmap resumido y cómo funcionan los filtros (AVENTA vs Promodescuentos).
- **Supabase:** `docs/SUPABASE_CONTEXTO.md` (schema, funciones, triggers, producción).
- **Código:** Next.js 16, React 19, Supabase, Upstash, Vercel; auth Google. Feed en `app/page.tsx` (viewMode, timeFilter, storeFilter, categoryFilter).

No hace falta saber programar para usar esta documentación: sirve para entender en qué punto está el producto, qué dice la beta y qué toca hacer a continuación.
