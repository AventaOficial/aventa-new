# Alineación con la visión y auditoría pre-lanzamiento — AVENTA

**Rol:** Product architect, UX, full-stack.  
**Objetivo:** Alinear el producto con la visión (“comunidad donde viven quienes saben encontrar buenas ofertas”) sin reescribir sistemas ni romper lógica existente.  
**Fuente de verdad:** Codebase y documentación en `/docs`.

---

## 1. System overview (resumen técnico)

### Rutas

| Ruta | Tipo | Propósito |
|------|------|-----------|
| `/` | Client | Feed: Día a día, Top, Para ti, Recientes; búsqueda; filtros tienda/categoría; período Hoy/Semana/Mes. |
| `/oferta/[id]` | Server + Client | Página canónica de oferta: detalle, votos, comentarios inline, CTA, reportar, compartir, favoritos. |
| `/categoria/[slug]`, `/tienda/[slug]` | Server + Client | Listados por categoría y tienda. |
| `/u/[username]` | Client | Perfil público: ofertas del usuario, reputación, avatar. |
| `/me`, `/me/favorites`, `/settings` | Client | Área usuario: mis ofertas, favoritos, preferencias. |
| `/admin/*` | Client | Moderación, métricas, equipo, reportes, logs, usuarios, bans. |
| `/descubre`, `/privacy`, `/terms` | Estático | Legales y explicación. |

### Componentes principales

- **OfferCard:** Feed, categoría, tienda, /me. Muestra imagen, precio, descuento, “Cazado por {username}”, badges (cazador_estrella, cazador_aventa), votos, favorito, compartir, un CTA “Cazar oferta”. Estados: Pendiente/Aprobada/Rechazada/Expirada en /me; Destacada, Prueba.
- **OfferPageContent:** Página oferta: marca, título, autor (“Cazado por”), precios, ahorro, votos, categoría/tienda, CTA “Ver oferta en tienda”, compartir, reportar, comentarios inline.
- **Hero:** Búsqueda; tagline “Cada peso ahorrado es un peso ganado”; VALUE_PROP “La comunidad que caza las mejores ofertas por ti. Tú subes, la comunidad vota.”
- **ActionBar:** Tabs Inicio, Comunidades, Favoritos, Perfil, Subir; modal de subir oferta.
- **Navbar:** Logo, notificaciones, ReputationBar (nivel), avatar.
- **ReputationBar:** Nivel y progreso; modal “¿Qué significan los niveles?” (reputación por ofertas/comentarios aprobados y likes).

### Base de datos (relevante para visión)

- **offers:** title, price, store, category, status, created_by, upvotes_count, downvotes_count, ranking_momentum, reputation_weighted_score.
- **profiles:** display_name, avatar_url, reputation_score, reputation_level, leader_badge (cazador_estrella, cazador_aventa), ml_tracking_tag, slug.
- **offer_votes:** value 2 (up) / -1 (down); triggers actualizan counts y reputation_weighted_score.
- **offer_events:** view, outbound, share (métricas; outbound = clic a tienda).
- **Vista ofertas_ranked_general:** ranking_blend = ranking_momentum + reputation_weighted_score.

### Sistema de votos y SEO

- Votos: API acepta 2/-1; OfferCard y OfferPageContent envían correctamente; batchUserData mapea 2→1 para UI.
- SEO: sitemap dinámico, canonical por oferta/categoría/tienda, JSON-LD (Product, Offer, AggregateRating), OG con imagen absoluta. Redirección /?o=id → /oferta/id.

---

## 2. Vision alignment analysis

**Pregunta:** ¿La interfaz actual comunica que AVENTA es una comunidad de cazadores de ofertas inteligentes?

### Lo que ya está alineado

- **“Cazado por {username}”** en OfferCard y OfferPageContent, con enlace a `/u/[username]`.
- **Badges** cazador_estrella y cazador_aventa visibles en card y página oferta (sin ruido excesivo).
- **Hero:** VALUE_PROP habla de “comunidad” y “caza”; tagline enfocado en ahorro.
- **Feed:** Subtítulo “Lo esencial, nosotros lo cazamos por ti” en Día a día; “Mejor puntuadas” en Top; “Priorizado por lo que guardaste y votaste” en Para ti.
- **Ranking:** reputation_weighted_score hace que el voto de usuarios con más reputación pese más (inteligencia comunitaria en backend, no líderes en portada).
- **Un solo CTA en card:** “Cazar oferta” (documentado); evita sensación de catálogo genérico.

### Desalineaciones y ajustes recomendados

| Área | Problema | Ajuste propuesto (refinamiento, no rediseño) |
|------|----------|---------------------------------------------|
| **OfferCard** | “Cazado por” está debajo de tienda/tiempo en texto pequeño; el cazador no destaca. | Subir ligeramente la línea del cazador (p. ej. justo bajo precio/descuento) o darle un poco más de peso visual (mismo texto, sin añadir badges nuevos). |
| **OfferCard** | Badges “Cazador estrella” / “Cazador Aventa” pueden leerse como ranking gamer. | Mantener los badges pero con copy más sobrio en el tooltip: “Cazador reconocido por la comunidad” (sin cambiar lógica). |
| **OfferPageContent** | El cazador aparece tras título; bien, pero “Cazado por” podría ser la primera línea bajo la marca (brand → título → cazador → precios). | Opcional: mover el bloque autor justo debajo del título para que “quien encontró la oferta” sea más visible. |
| **Perfil /u/[username]** | “Score total” y “X ofertas publicadas” suenan a foro/clasificación. | Cambiar copy a “X ofertas cazadas” y, si se muestra número, “Contribución a la comunidad” en lugar de “Score total” (o mantener el número pero con etiqueta más neutra: “Impacto en el ranking”). |
| **Home feed** | Cuatro pestañas (Día a día, Top, Para ti, Recientes) + filtros + período pueden abrumar en móvil. | No eliminar pestañas; asegurar que la línea de ayuda bajo las pestañas sea clara y estable. Ya está; solo vigilar que no se añadan más filtros visibles. |
| **ReputationBar** | “Nivel X – {label}” y barra de progreso pueden parecer gamificación. | Mantener sistema; suavizar copy en el modal de ayuda: “Tu reputación refleja la confianza de la comunidad” en lugar de listar solo niveles. |

**Conclusión:** La base está alineada (cazador visible, comunidad, reputación). Los cambios son de **énfasis y copy**, no de flujos ni de arquitectura.

---

## 3. UX simplification proposals

Principios: reducir ruido visual, más claridad, cazador destacado de forma sutil, más confianza. Sin gamificación barata.

### 3.1 OfferCard

- **Orden de información (actual):** imagen + votos → título → precio/descuento → tienda • tiempo → Cazado por X [badges] → descripción (md) → CTA.
- **Propuesta:** Dejar estructura; asegurar que “Cazado por” no quede visualmente por debajo de “tienda • hace X”. Opción: una sola línea “Tienda · Cazado por X” o “Cazado por X · Tienda” para que el cazador comparta protagonismo con la tienda.
- **Badges:** Un solo estilo visual (por ejemplo solo icono BadgeCheck + tooltip “Cazador reconocido”), sin dos variantes de color si se quiere aún más minimalismo (esto es opcional; la doc ya define dos badges).

### 3.2 OfferPageContent (página oferta)

- **Jerarquía:** Marca (violet) → Título → **Cazado por {username}** [badges] → Precios y ahorro → Votos → Categoría/tienda → CTA.
- **Propuesta:** No añadir bloques nuevos. Si en algún lugar el autor se muestra más abajo que los votos, considerar subir el bloque autor para que quede antes de votos (el cazador antes que la reacción numérica).

### 3.3 Feed (home)

- **Línea de ayuda:** Ya existe (“Lo esencial…”, “Mejor puntuadas…”, etc.). Mantenerla y no añadir más texto bajo las pestañas.
- **Filtros de categoría (Día a día):** Botones pill “Todas” + categorías vitales; correcto. No añadir más filtros en esta fase.

### 3.4 Perfil público (/u/[username])

- **Propuesta:** Sustituir “Score total: X” por “Contribución: X ofertas aprobadas” o “X ofertas que la comunidad votó”, y “ofertas publicadas” por “ofertas cazadas”. Mantener ReputationBar; el modal de niveles puede usar el copy más orientado a “confianza de la comunidad”.

### 3.5 Confianza

- **Moderación visible:** No mostrar “pendiente de moderación” en la card de oferta en el feed (solo en /me). Ya está así.
- **Reportar:** Modal de reporte con motivo y descripción mínima; ya existe. No añadir pasos extra.
- **Empty states:** Mensajes en español y CTA claros (ya aplicados en feed y comentarios).

---

## 4. Hunter identity layer (diseño mínimo)

Objetivo: una capa de identidad del cazador **elegante y mínima**, sin leaderboards ni puntos llamativos.

### Ya implementado (respetar)

- **“Cazado por {username}”** en card y página oferta, con enlace a perfil.
- **leader_badge:** cazador_estrella, cazador_aventa (asignación manual/administrativa).
- **Reputación:** reputation_score y reputation_level; peso en ranking (reputation_weighted_score); ReputationBar en perfil y en Navbar (propio usuario).
- **Perfil público:** `/u/[username]` con ofertas aprobadas y reputación.

### Propuesta de indicadores de credibilidad (sin cambiar esquema)

| Indicador | Significado | Implementación sugerida |
|-----------|-------------|-------------------------|
| **Cazador reconocido** | Tiene leader_badge (cazador_estrella o cazador_aventa). | Ya existe. Unificar copy en tooltip: “Cazador reconocido por la comunidad” para ambos. |
| **Cazador consistente** | Nivel de reputación ≥ 2 o 3 (comentarios al instante u ofertas en Recientes al instante). | No añadir badge nuevo; el nivel ya se ve en su perfil. Opcional: en la card no mostrar nivel; solo en perfil. |
| **Verificado** | Si en el futuro se añade “verificado” (ej. cuenta vinculada), podría ser un pequeño check. | No implementar ahora; no hay campo ni flujo. |

Regla: **no introducir nuevos badges ni niveles visibles en la card.** Solo refinar el copy de los badges actuales para que suenen a “confianza” y “reconocimiento”, no a “puntos” o “nivel”.

### Copy sugerido para badges (solo texto)

- **Cazador estrella:** tooltip “Reconocido por la comunidad”.
- **Cazador Aventa:** tooltip “Cazador destacado”.
- En el perfil, ReputationBar: “Tu reputación refleja la confianza que la comunidad tiene en tus aportes.”

---

## 5. Impact visualization (propuesta simple)

Objetivo: mostrar impacto de la comunidad de forma clara y mínima, con datos existentes.

### Datos disponibles (sin cambiar esquema)

- **Por oferta:** original_price, price (discountPrice); ahorro por unidad = originalPrice − discountPrice. Ya se muestra “Ahorras $X” en la página de oferta.
- **offer_events:** event_type = 'outbound' (clic a tienda). No se expone hoy en la UI pública.

### Propuesta 1 (mínima, recomendada para lanzamiento)

- **Solo reforzar lo existente:** En la página de oferta ya está “Ahorras {formatPriceMXN(savings)}”. Añadir una línea opcional justo debajo, en gris y texto pequeño: “Si aprovechas esta oferta, ese es tu ahorro.” No añadir cifras agregadas de “la comunidad ahorró $X” hasta tener datos claros y un criterio de cálculo.

### Propuesta 2 (después de lanzamiento, opcional)

- **Impacto agregado por oferta:** Definir “impacto estimado” = (ahorro por unidad) × (número de outbound en ventana, ej. 30 días). Requiere exponer outbound_count por oferta (hoy solo en admin). Mostrar en la página de oferta, debajo de “Ahorras $X”: “Aproximadamente X personas fueron a la tienda” (sin mencionar “ahorro total” para no sobreprometer). Si más adelante se quiere “La comunidad pudo ahorrar hasta $Y con esta oferta”, sería Y = ahorro × outbound (como estimación). No implementar en pre-lanzamiento; solo dejar documentado.

### Resumen impacto

- **Pre-lanzamiento:** Mantener “Ahorras $X” y, si se desea, una frase que enfatice que es el ahorro de quien aprovecha la oferta.
- **Post-lanzamiento:** Valorar mostrar “X personas fueron a la tienda” (desde offer_events) y, en una segunda fase, una estimación de “ahorro potencial de la comunidad” con criterio documentado.

---

## 6. Pre-launch product audit

### Inconsistencias de UX

- **Perfil:** “Score total” y “ofertas publicadas” suenan a foro; “ofertas cazadas” y “contribución” alinean mejor con la visión.
- **Badges:** Dos nombres distintos (Cazador estrella, Cazador Aventa) sin explicación en la card; un tooltip unificado ayudaría.
- **Feed:** Las cuatro vistas están bien; la etiqueta “Recientes” es clara; “Para ti” puede no tener ofertas al inicio; el empty state de feed ya está en español.

### Flujos confusos

- **Comunidades:** Sigue en la ActionBar y lleva a “Próximamente”. Según docs es placeholder; si se quiere reducir ruido, mover a menú secundario o footer (no obligatorio para lanzamiento).
- **Onboarding:** Categorías; si el usuario cierra sin registrarse, no se sincronizan al registrarse. Documentado; no cambiar flujo en esta fase.

### Componentes rotos o redundantes

- **OfferModal:** Ya no se usa en home; solo en /u/[username] (perfil) si se abre una oferta desde ahí. Revisar si en perfil se usa; si no, el componente queda para posible uso futuro sin eliminarlo.
- **Votos:** Lógica unificada (API 2/-1); OfferCard y OfferPageContent correctos.

### Partes que aún parecen “sitio de ofertas genérico”

- **OfferCard:** Sin “Cazado por” arriba, la card sería solo precio + descuento + tienda. Ya se muestra el cazador; con el pequeño ajuste de orden o peso visual se refuerza la identidad.
- **Hero:** VALUE_PROP ya habla de comunidad y caza; no genérico.
- **Página oferta:** Título + precio + CTA podrían ser de cualquier comparador; la presencia de “Cazado por”, comentarios y votos la acercan a comunidad. Mantener y, si acaso, subir el bloque del cazador.

---

## 7. Launch readiness report

### 7.1 Fortalezas actuales

- Vista canónica única (/oferta/[id]); sin modal duplicado en home.
- Votación correcta (API 2/-1) en card y página.
- “Cazado por” y badges en card y página oferta; enlace a perfil.
- Reputación y ranking con peso por reputación (ranking_blend); sin leaderboard público.
- Hero y feed con mensaje de comunidad y caza.
- Un solo CTA en card (“Cazar oferta”); página de oferta con CTA claro a tienda.
- SEO: sitemap, canonical, JSON-LD, OG.
- Errores de carga con mensaje/toast en feed, config, tiendas, votos.
- Empty states y copy en español.
- Moderación, reportes y estados de oferta en /me (Pendiente/Aprobada/Rechazada/Expirada).

### 7.2 Mejoras críticas antes de lanzamiento

1. **Prueba E2E manual** (registro → onboarding → subir oferta → votar → comentar → favorito → compartir → reportar → moderar → oferta en feed). Documentado en LAUNCH_CHECKLIST_BETA.
2. **Copy de perfil:** Cambiar “Score total” y “ofertas publicadas” a lenguaje “cazador” (ej. “X ofertas cazadas”, “Contribución a la comunidad” o similar), sin cambiar lógica.
3. **Tooltip de badges:** Unificar mensaje (“Cazador reconocido por la comunidad” / “Cazador destacado”) para que no suenen a ranking de puntos.

### 7.3 Mejoras opcionales después de lanzamiento

- Subir ligeramente el bloque “Cazado por” en OfferCard o unificar línea “Tienda · Cazado por X”.
- En OfferPageContent, colocar autor justo bajo el título si actualmente queda por debajo de votos.
- Frase bajo “Ahorras $X”: “Si aprovechas esta oferta, ese es tu ahorro.”
- “X personas fueron a la tienda” en página oferta (cuando se exponga outbound_count).
- Mover “Comunidades” fuera de la barra principal si se prioriza simplicidad.

### 7.4 Elementos que no se deben tocar ahora

- Lógica de votos (API 2/-1, triggers, batchUserData).
- Esquema de BD (offers, profiles, offer_votes, offer_events, leader_badge, reputation).
- Estructura SEO (sitemap, canonical, JSON-LD, rutas indexables).
- APIs de ofertas, comentarios, reportes, moderación.
- Número de pestañas del feed (Día a día, Top, Para ti, Recientes).
- Sistema de reputación (niveles y progreso); solo copy del modal de ayuda.

---

## 8. Recommended next steps

### Inmediatos (pre-lanzamiento)

1. Ejecutar la **prueba E2E** completa y corregir cualquier fallo.
2. **Copy en perfil público:** “X ofertas cazadas” (o “publicadas” si se prefiere mantener término) y reemplazar “Score total” por “Contribución” o “Impacto en el ranking” (manteniendo el número).
3. **Tooltips de badges** en OfferCard y OfferPageContent: “Cazador reconocido por la comunidad” (cazador_estrella) y “Cazador destacado” (cazador_aventa).

### Opcionales (refinamiento visual, sin cambiar flujos)

4. En **OfferCard**, probar una sola línea “Cazado por X · Tienda” o “Tienda · Cazado por X” para que el cazador no quede visualmente por debajo de la tienda.
5. En **OfferPageContent**, asegurar que el bloque del autor esté siempre visible antes o junto a los votos (ya está; solo verificar orden en móvil/desktop).
6. En **ReputationBar** (modal de ayuda), añadir una frase inicial: “Tu reputación refleja la confianza que la comunidad tiene en tus aportes.”

### No hacer en esta fase

- Nuevos badges o niveles.
- Leaderboards públicos.
- Cambios en BD o en APIs de votos/comentarios/ofertas.
- Nuevas pestañas o filtros en el feed.
- Cálculo de “ahorro de la comunidad” hasta definir criterio y datos.

---

*Documento de alineación con la visión y auditoría pre-lanzamiento. Las recomendaciones son refinamientos (copy, orden visual, tooltips) que respetan la arquitectura y la documentación en `/docs`.*
