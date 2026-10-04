# Founder OS + Product UX

Rama: `product/founder-os` (desde `master` `0d97401`). Solo producto/UX: no toca dinero, RLS, auth, migraciones, scanner, lifecycle, crons ni datos de producción.

## 1. Qué había (auditoría)

- **Una entrada para el owner**: `/admin/*` es solo owner; el layout monta `OwnerShell` con `OWNER_NAV_SECTIONS`.
- **El CEO Dashboard (`/admin/owner`)** es un mosaico con datos reales (`useCommandCenter` + `deriveHealth` / `derivePriorities` / `deriveGoals`), pero **todas sus tarjetas enlazaban a `/admin/owner/vista/*`**, que son composiciones visuales de referencia con números fijos. El owner hacía clic en un dato real y terminaba en uno ficticio.
- **Menú por audiencia en inglés** (CEO / Operations / Technical, 18 ítems) mezclando uso diario con herramientas técnicas.
- **Superficies huérfanas**: `/admin/coupons` sin ningún enlace; `vote-weights`, `distribution`, `mantenimiento`, `creator-tags`, `announcements`, `owner/cazadores` solo en el buscador.
- **Conflicto de nombres**: `/admin/hunter` se titulaba «CEO Control Center».
- **Owner ↔ Team OS**: el botón «Abrir Team OS» llevaba al owner a `/team`, que exige una membresía que el owner no puede tener por diseño (separación probada por tests). No era un fallo de permisos sino de navegación.
- **Componentes de owner sin uso** (`CeoControlCenter`, `OwnerKpiStrip`, `RevenueSection`, `BusinessPerformance`, `TeamCarousel`, `command/teams/*`, varias tarjetas ceo antiguas). Se dejan intactos: algunos sostienen tests de contrato.

## 2. Arquitectura por capacidad

Tres audiencias. Cada sección responde una pregunta.

| Sección | Pregunta | Uso diario (visible) | Más herramientas (plegado) |
|---|---|---|---|
| CEO | ¿Qué debo decidir hoy? | Control Center, Moderation, Supply, Money, Users, Health | Cazadores de confianza, Cupones, Contabilidad |
| Operations | ¿Cómo está funcionando Aventa hoy? | Live Metrics, Growth, Rewards Ops, Operaciones, Bot y trabajo, Activity | Distribución, Avisos del sitio, Tags de creadores |
| Technical | ¿Cómo está armado y quién puede hacer qué? | Infrastructure, Systems Map, Configuration, Technical, Roles y permisos | Equipos de trabajo, Team Hub, Peso de voto, Mantenimiento |

Fuente única: `lib/owner/navigation.ts` (sidebar + buscador). Nada se eliminó; el Mapa de sistemas se conserva. «Team» ya no aparece suelto: `/admin/team` es «Roles y permisos» y `/equipo` es «Team Hub».

**Baneos**: `/admin/moderation/bans` es ahora una pestaña del hub de Moderación (`lib/moderation/hubConfig.ts`); misma página y mismos guards, sin ruta nueva.

## 3. Clasificación de superficies

- **A · Core Founder**: `/admin/owner` (Control Center).
- **B · Operación diaria**: moderación (+ pestañas, incluida Baneos), supply, usuarios, money, salud, métricas, growth, rewards ops, operaciones, bot y trabajo, activity.
- **C · Especializada** (plegada): cazadores de confianza, cupones, distribución, avisos, contabilidad, tags de creadores, equipos de trabajo, Team Hub.
- **D · Técnica**: infraestructura, systems map, configuration, technical, roles y permisos (visibles); peso de voto y mantenimiento (plegadas).
- **E · Legacy / ocultable** (sin enlaces, no borradas): `/admin/owner/vista/*` (referencia visual), `/admin/dashboard` y `/admin/analista` (redirigen), `/admin/equipo` y `/admin/reports` (redirects). Componentes de owner sin uso listados arriba.

## 4. Control Center (una sola puerta)

Prioridad DECISIONES > ALERTAS > ACCIONES > MÉTRICAS, sin crear otro dashboard:

- **Franja de decisión** en el hueco izquierdo de la barra superior (no cuesta altura en desktop): estado global, número de prioridades críticas/altas y la siguiente acción con enlace real. Pura función `summarizeDecision` sobre `deriveHealth` + `derivePriorities`. `FROZEN` no cuenta como problema (congelamiento intencional); sin datos nunca se muestra como «Todo en orden».
- **Drill-downs reales** (`app/admin/owner/command/drilldowns.ts`): comunidad → métricas, usuarios → usuarios, ofertas → aprobadas, ingresos → comisiones, pagos → recompensas, capacidad → infraestructura, metas → moderación; equipos → la herramienta de cada equipo. Prioridades ya enlazaban a su herramienta por fila. Temporada: no hay página real de campaña, así que el CTA pasa a «Preparar avisos» (Avisos del sitio) y la tarjeta deja de enlazar.
- **Móvil**: el orden pasa a prioridades → equipos → metas → pagos → métricas. Desktop no cambia.

### CEO Dashboard: qué se queda
Se queda todo el mosaico. Ninguna tarjeta duplica a otra; lo único duplicado eran las vistas de referencia, que pasan a E.

## 5. Lenguaje humano por módulo

`lib/founderOs/modules.ts` define para cada uno de los 17 módulos visibles (el nombre coincide con la etiqueta del menú): «Qué es», por qué existe, qué protege (riesgo), qué mide (métrica), cómo interpretarlo, **qué decisión permite**, **qué NO controla**, **cuándo entrar** y responsable. **Estado, qué requiere atención y última actualización no se escriben a mano**: `lib/founderOs/moduleStatus.ts` los deriva de las mismas señales del Control Center. Se muestra en una tarjeta plegada «¿Qué es esto?» arriba de cada módulo (`ModuleBrief`), que solo consulta datos al abrirse. Rutas y fuentes quedan detrás de «Ver detalles técnicos». Tests impiden nombres técnicos en el texto humano.

Pendiente: fichas para las herramientas plegadas (C/D).

## 6. Delegación (sin sistema nuevo)

Cada prioridad del Control Center ya trae lo que un moderador necesita; la delegación es leerla así:

- **Qué**: `problem` · **Por qué**: `reason` + `impact` · **Cuántos**: `quantity` · **Prioridad**: `severity` · **Dónde**: `href`.
- **Qué significa terminado**: la condición que dispara la prioridad deja de cumplirse (la prioridad desaparece sola del Control Center).

Siguiente paso posible (no implementado): mostrar esas prioridades filtradas por equipo en Team Hub. No requiere tablas.

## 7. Owner y permisos de equipo

Dos modelos, ambos intencionales: `user_roles` (acceso al panel, `/admin/team` = «Roles y permisos») y membresías de Team OS (trabajo diario, «Equipos de trabajo»). El owner supervisa desde **Team Hub (`/equipo`)**, que ya lo admite. Corrección: el botón de gestión de equipos ahora abre Team Hub. Sin bypass, sin cambios de RLS ni permisos globales.

## 8. Media, patrocinios y comunidad

- **OfferMedia**: marco decidido por `offerFrameMode`. Si el borde es uniforme, la placa toma su color. Si la foto aún no se mide, es transparente o no se puede leer (otra tienda sin CORS), va sobre una placa neutra clara. Solo una escena medida usa el desenfoque. Esto elimina el recuadro blanco «flotando» en dark mode y el parpadeo previo a la medición. `contain` por defecto, fallback accesible, hosts fuera de la allowlist vía `<img>` (la CSP permite https). Aplicado también en favoritos, perfil público y vista previa del cazador.
- **SponsoredPlacement**: catálogo de campañas + política de inserción (sin `index % 4` ni `index === 1`), rotación, ventanas de fechas, tope por feed, eventos locales de impresión/clic (sin red ni tablas). Paridad con producción: mismo creativo en la misma posición.
- **Rail de comunidad**: Pedidos de caza, conversaciones de la Plaza y cazadores del feed, con datos reales y vacíos honestos.

## 9. Auditoría de diferenciación

Identidad propia: **CAZAR** (pedidos de caza, hunter), **COMUNIDAD** (Plaza, cazadores visibles), **INTELIGENCIA** (precio real verificado por moderación), **RECOMPENSA** (programa de cazadores). El rail lateral prioriza personas y pedidos de caza en vez de rankings de temperatura.

## 10. Campaign OS (solo concepto, sin tablas)

Una campaña es una ventana del calendario (`lib/achievements/calendar`, ya usado por la tarjeta de temporada) que conecta, en fases *preparar → calentar → pico → cierre*:

| Pieza | Qué aporta |
|---|---|
| Catálogo | Colecciones por categoría y metas de ofertas aprobadas |
| Tiendas | Qué tiendas participan y sus fuentes en hunter |
| Afiliación | Enlaces y seguimiento (solo lectura hasta que el dinero se descongele) |
| Contenido | Avisos del sitio, banners, textos |
| Comunidad | Pedidos de caza temáticos en la Plaza |
| Cazadores | Retos y reconocimiento |
| Patrocinios | Campañas del catálogo de patrocinios con ventana de fechas |
| SEO | Página de temporada |
| Métricas | Ofertas, clics y participación contra la temporada anterior |

Temporadas: Buen Fin, Navidad, Hot Sale, Regreso a clases, Prime Day, Día de las Madres. Implementación futura requiere decisión de producto y, probablemente, datos persistentes (fuera de este alcance).

## 11. Decisiones pendientes

1. Los creativos patrocinados actuales son internos (sin anunciante real) y dicen «Patrocinado». Decidir si se rotulan como promoción propia.
2. Destino de las vistas de referencia `/admin/owner/vista/*`: borrar o convertirlas en vistas reales.
3. Borrado de componentes de owner sin uso (requiere ajustar tests de contrato).
4. Fichas humanas para herramientas C/D.
5. Campaign OS: priorizar temporada piloto (Buen Fin).
