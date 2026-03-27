# Auditoria pre-lanzamiento page-by-page (AVENTA)

Fecha: 27 de marzo de 2026  
Version: 1.0 (entregable para revision externa)

## 1) Resumen ejecutivo

Este documento describe el estado real de AVENTA antes de lanzamiento, con enfoque en:

- lectura funcional de cada `page.tsx`,
- consistencia tecnica entre rutas,
- deteccion de duplicidades y deuda,
- brecha entre el estado actual y un producto premium no generico.

Conclusion ejecutiva:

- AVENTA ya supera una fase MVP inicial y tiene base seria para salir al mercado.
- El mayor riesgo ya no es "falta de features", sino "consistencia y pulido transversal".
- La parte publica (feed/perfiles/detalle) esta en mejor estado que la parte interna de admin/moderacion.
- Antes de escalar fuerte, conviene cerrar una fase corta de polish y consolidacion tecnica.

## 2) Alcance y metodologia

### 2.1 Alcance

- Auditoria de rutas `app/**/page.tsx`.
- Analisis funcional y arquitectonico (no se realizaron cambios de codigo en esta auditoria).
- Enfoque en lanzamiento: confiabilidad, mantenimiento, UX percibida, coherencia de producto.

### 2.2 Metodologia

1. Inventario completo de pages.
2. Clasificacion por area (publica, usuario, owner, admin).
3. Revision por ruta:
   - objetivo de negocio,
   - flujo principal,
   - dependencias de datos/APIs,
   - riesgos tecnicos/UX,
   - nivel de madurez percibida (1-5).
4. Cruce de patrones para encontrar duplicidades.
5. Comparacion contra benchmark "producto premium pulido".
6. Priorizacion de backlog P0/P1/P2.

### 2.3 Criterios de calidad usados

- Coherencia funcional entre pantallas.
- Single source of truth en logica critica.
- Robustez de estados (`loading`, `error`, `empty`, `success`).
- Legibilidad operativa para owner/admin.
- Percepcion premium (animaciones, microinteracciones, consistencia visual).
- Mantenibilidad para equipo futuro.

## 3) Inventario de rutas (page.tsx)

### 3.1 Publico / descubrimiento

- `/` -> `app/page.tsx`
- `/descubre` -> `app/descubre/page.tsx`
- `/extension` -> `app/extension/page.tsx`
- `/categoria/[slug]` -> `app/categoria/[slug]/page.tsx`
- `/tienda/[slug]` -> `app/tienda/[slug]/page.tsx`
- `/oferta/[id]` -> `app/oferta/[id]/page.tsx`
- `/u/[username]` -> `app/u/[username]/page.tsx`
- `/subir` -> `app/subir/page.tsx` (redirect/deep link)

### 3.2 Cuenta de usuario

- `/me` -> `app/me/page.tsx`
- `/me/favorites` -> `app/me/favorites/page.tsx`
- `/settings` -> `app/settings/page.tsx`
- `/auth/reset-password` -> `app/auth/reset-password/page.tsx`

### 3.3 Owner / operacion

- `/operaciones` -> `app/operaciones/page.tsx`
- `/contexto` -> `app/contexto/page.tsx`
- `/mi-panel` -> `app/mi-panel/page.tsx` (redirect)
- `/admin/owner` -> `app/admin/owner/page.tsx` (redirect)

### 3.4 Admin / moderacion / gobierno

- `/admin/moderation` -> `app/admin/moderation/page.tsx`
- `/admin/moderation/approved` -> `app/admin/moderation/approved/page.tsx`
- `/admin/moderation/rejected` -> `app/admin/moderation/rejected/page.tsx`
- `/admin/moderation/comments` -> `app/admin/moderation/comments/page.tsx`
- `/admin/moderation/bans` -> `app/admin/moderation/bans/page.tsx`
- `/admin/reports` -> `app/admin/reports/page.tsx`
- `/admin/users` -> `app/admin/users/page.tsx`
- `/admin/team` -> `app/admin/team/page.tsx`
- `/admin/announcements` -> `app/admin/announcements/page.tsx`
- `/admin/vote-weights` -> `app/admin/vote-weights/page.tsx`
- `/admin/metrics` -> `app/admin/metrics/page.tsx`
- `/admin/health` -> `app/admin/health/page.tsx`
- `/admin/logs` -> `app/admin/logs/page.tsx`
- `/admin/analista` -> `app/admin/analista/page.tsx`

### 3.5 Legal

- `/terms` -> `app/terms/page.tsx`
- `/privacy` -> `app/privacy/page.tsx`

## 4) Analisis detallado page-by-page

> Escala de madurez UX: 1 = basico, 5 = muy pulido.

---

### 4.1 `/` (`app/page.tsx`) - Home/feed principal

**Que hace**  
Es la pagina mas importante del producto. Gestiona feed principal, modos de ranking, filtros, busqueda, interacciones (favorito/voto), parte de realtime y carga incremental.

**Flujo principal**  
Usuario entra -> carga feed (home/for-you/top/reciente segun modo y bandera) -> render `OfferCard` -> usuario interactua -> actualizacion visual y/o refetch.

**Datos/APIs**  
Consume APIs de feed y configuracion, y cruza con datos de usuario para estado de favorito/voto.

**Fortalezas**

- Base UX fuerte para discovery.
- Varios estados de uso (filtros, vacio, carga, error).
- Mejoras recientes de scoring y consistencia de ranking.

**Riesgos / puntos a vigilar**

- Archivo grande y multifuncion (alto costo de mantenimiento).
- Riesgo de divergencia por coexistencia de rutas de datos (feed API nuevo vs fallback/legacy).
- Complejidad alta para onboarding de nuevos devs.

**Madurez UX**: 4/5

---

### 4.2 `/oferta/[id]` (`app/oferta/[id]/page.tsx`) - Detalle de oferta

**Que hace**  
Render SSR del detalle con SEO reforzado y datos estructurados.

**Flujo principal**  
Solicitud servidor -> obtiene oferta -> compone metadata/JSON-LD -> entrega contenido de detalle.

**Fortalezas**

- Buen enfoque SEO para indexacion.
- Ruta clave para conversion bien separada del feed.

**Riesgos**

- La experiencia final depende tambien de `OfferPageContent` (fuera de este `page.tsx`).

**Madurez UX**: 4-5/5

---

### 4.3 `/categoria/[slug]` y `/tienda/[slug]` - Landing tematica/tienda

**Que hacen**  
Paginas SSR para agrupar ofertas por categoria o tienda.

**Flujo principal**  
Server render por slug -> transforma filas a formato de tarjeta -> lista resultados.

**Fortalezas**

- SEO y descubrimiento de cola larga.
- Coherente con navegacion de contenido.

**Riesgos**

- Mapeos de oferta similares/repetidos (deuda de unificacion).

**Madurez UX**: 4/5

---

### 4.4 `/u/[username]` - Perfil publico

**Que hace**  
Presenta identidad publica del creador (reputacion + ofertas).

**Flujo principal**  
Carga API perfil -> render header reputacional -> render listado ofertas.

**Fortalezas**

- Transparencia de aportes.
- Alineado con dinamica de comunidad.

**Riesgos**

- Parte del comportamiento en tiempo real y consistencia depende de hooks compartidos.

**Madurez UX**: 4/5

---

### 4.5 `/me` - Panel personal

**Que hace**  
Centro del usuario logueado: nivel, puntos, impacto, ofertas propias, programa de comisiones.

**Flujo principal**  
Carga datos de perfil + impacto + ofertas -> muestra progreso reputacional/comisiones -> acciones del usuario.

**Fortalezas**

- Buena integracion de reputacion y programa de comisiones.
- UX compacta y clara para progreso.

**Riesgos**

- Es una pantalla de alta densidad de estado; requiere disciplina de consistencia para no degradar en iteraciones futuras.

**Madurez UX**: 4/5

---

### 4.6 `/me/favorites` - Favoritos

**Que hace**  
Lista ofertas guardadas por el usuario y facilita volver a ellas.

**Flujo principal**  
Query de favoritos -> mapeo a tarjetas -> interaccion de favoritos/votos.

**Fortalezas**

- Funcional y directa.
- Aprovecha componentes principales del ecosistema de ofertas.

**Riesgos**

- Repeticion de ciertos patrones del home y `/me` (deuda de DRY parcial).

**Madurez UX**: 4/5

---

### 4.7 `/settings` - Configuracion de cuenta

**Que hace**  
Ajustes de perfil/preferencias/notificaciones.

**Flujo principal**  
Carga ajustes -> usuario edita -> guardado de preferencias.

**Fortalezas**

- Cobertura funcional correcta para etapa actual.

**Riesgos**

- En algunos flujos la gestion de error puede ser mas explicita (feedback de fallo de guardado).

**Madurez UX**: 4/5

---

### 4.8 `/auth/reset-password` - Recuperacion de acceso

**Que hace**  
Permite establecer nueva contraseña al usuario tras flujo de reset.

**Fortalezas**

- Flujo esencial cubierto.

**Riesgos**

- Debe cuidarse especialmente la comunicacion de estados invalidos/expirados para reducir confusion.

**Madurez UX**: 3/5

---

### 4.9 `/descubre` y `/extension` - Onboarding y educacion

**Que hacen**  
Documentan y orientan sobre uso del producto y extension.

**Fortalezas**

- Ayudan a reducir friccion de adopcion.
- Tono visual coherente con marca.

**Riesgos**

- Dependencia de mantener contenido actualizado con cada cambio funcional.

**Madurez UX**: 3.5-4/5

---

### 4.10 `/operaciones` - Centro owner

**Que hace**  
Panel operativo para owner con salud del sistema, integrity checks, toggles y contexto de mantenimiento.

**Flujo principal**  
Carga estado operativo -> refresco periodico -> owner decide acciones.

**Fortalezas**

- Diferenciador fuerte para gestion sin friccion.
- Refresco automatico ya implementado.

**Riesgos**

- Puede crecer de forma monolitica si no se modulariza por secciones.

**Madurez UX**: 4/5

---

### 4.11 `/contexto`, `/mi-panel`, `/admin/owner`

**Que hacen**  
Rutas de navegacion/redirect para ordenar acceso owner.

**Fortalezas**

- Claridad de puerta de entrada a operacion.

**Riesgos**

- Reglas de guard similares en varias rutas (candidato a hook/util unico).

**Madurez UX**: 3-4/5 (segun su funcion de enlace)

---

### 4.12 Bloque `/admin/*` - Vision general

**Que hace**  
Suite interna para moderacion, gobierno de usuarios, metrica y auditoria.

**Fortalezas**

- Cobertura funcional amplia.
- Buen nivel de control operativo para etapa de crecimiento.

**Riesgos**

- Experiencia visual/operativa menos pulida que frontend publico.
- Variacion de patrones de feedback (en partes se usan mensajes poco uniformes).
- Mayor carga de mantenimiento por repeticiones.

**Madurez UX**: 2.5-3.5/5 (segun modulo)

#### 4.12.1 Moderacion (`/admin/moderation*`)

- `pending` (`/admin/moderation`) es la vista mas completa del bloque.
- `approved` y `rejected` tienen estructura muy similar (duplicidad clara).
- `comments` y `bans` cubren necesidades reales de gobernanza comunitaria.

Riesgo principal: deuda por duplicacion + variabilidad de UX interna.

#### 4.12.2 Gestion y gobierno (`/admin/users`, `/admin/team`, `/admin/vote-weights`, `/admin/announcements`)

- Funcionan como panel operativo administrativo.
- Buena cobertura de operaciones manuales.

Riesgo principal: estandarizar mensajes de exito/error y patron de confirmaciones.

#### 4.12.3 Analitica y salud (`/admin/metrics`, `/admin/health`, `/admin/logs`, `/admin/analista`, `/admin/reports`)

- Son clave para monitoreo y toma de decisiones.
- `reports` aporta trazabilidad de calidad de contenido.

Riesgo principal: limpiar codigo no usado y unificar criterios de visualizacion/estado.

---

### 4.13 Legal (`/terms`, `/privacy`)

**Que hacen**  
Cobertura legal base de plataforma.

**Fortalezas**

- Existen y fueron expandidas con secciones relevantes (comisiones/cookies).

**Riesgos**

- Diferencia de shell/navegacion respecto a otras secciones puede dar sensacion de experiencia fragmentada.

**Madurez UX**: 3.5-4/5 (contenido), 3/5 (consistencia de experiencia)

## 5) Duplicidades y deuda tecnica detectada

### 5.1 Duplicidades funcionales (alta prioridad)

1. Mapeo de oferta repetido en rutas de listado (`home`, `categoria`, `tienda`, y variantes de perfil/favoritos).
2. Pags de moderacion `approved` y `rejected` con patrones casi gemelos.
3. Formateos de fecha/tiempo repetidos en varios modulos admin.
4. Reglas de acceso owner/admin repetidas (guards similares en multiples vistas).

### 5.2 Duplicidades de UX (media prioridad)

1. Varias implementaciones de `loading` sin componente comun.
2. Manejo de errores/exito no homogeneo en admin.
3. Estados vacios no totalmente estandarizados entre modulos.

### 5.3 Impacto de estas duplicidades

- Mayor probabilidad de bugs por cambios parciales.
- Mayor tiempo de desarrollo por cada ajuste transversal.
- Mayor costo de onboarding para nuevo equipo tecnico.
- Riesgo de percepcion "inconsistente" para usuarios internos.

## 6) Comparacion contra benchmark de producto premium

## 6.1 Que caracteriza una experiencia premium (referencia objetiva)

Un producto premium percibido como "pulido" suele mostrar:

- consistencia visual/funcional en todas las areas (no solo home),
- microinteracciones suaves y coherentes,
- tiempos percibidos de respuesta bien gestionados,
- mensajes de estado claros y no abruptos,
- accesibilidad y ergonomia operativa cuidadas,
- arquitectura mantenible para evolucion rapida sin romper.

## 6.2 Estado actual de AVENTA vs benchmark

### Fortalezas ya alineadas

- Identidad y UX publica con buena base.
- Navegacion por contenido y discovery bien planteada.
- Capas operativas owner/admin ya existentes (no improvisadas).
- Legales y centro de operaciones presentes.

### Brechas actuales

1. Diferencia de nivel de polish entre front publico y admin.
2. Repeticiones tecnicas que erosionan coherencia a mediano plazo.
3. Falta de estandar unico para estados UI en todos los modulos.
4. Microinteracciones premium concentradas en ciertas pantallas, no en todo el sistema.

### Riesgo de salida "generica"

No viene por falta de funcionalidades, sino por:

- inconsistencia entre areas,
- feedback operativo poco uniforme,
- deuda no consolidada de componentes/patrones internos.

## 7) Riesgos de lanzamiento (priorizados)

### P0 (afectan confianza y mantenimiento inmediato)

1. Divergencia de logica en mapeos de oferta entre rutas.
2. Duplicacion fuerte en moderacion approved/rejected.
3. Estados de error/exito no unificados en admin.
4. Complejidad alta del home para mantenimiento rapido sin regresiones.

### P1 (afectan calidad percibida y velocidad de iteracion)

1. Repeticion de guards de rol.
2. Repeticion de utilidades de fecha/formato.
3. Inconsistencia de loaders/skeletons entre paginas.
4. Bloques admin con UX mas "utilitaria" que "producto cuidado".

### P2 (afectan excelencia y escalado largo)

1. Accesibilidad avanzada en modales/tablas internas.
2. Sistema de motion/microinteracciones transversal.
3. Normalizacion total de tokens visuales entre publico/admin.

## 8) Plan recomendado para programador experto

## 8.1 Objetivo del plan

Cerrar brecha de calidad sin rehacer producto, con foco en:

- consolidacion tecnica,
- coherencia UX transversal,
- salida a mercado con percepcion premium y operabilidad estable.

## 8.2 Fase A (0-3 dias) - Seguridad de consistencia

1. Unificar mapeo de oferta en una utilidad central.
2. Estandarizar helpers de fecha y formato.
3. Crear util/hook comun para guards de rol.
4. Revisar rutas de home/feed para asegurar comportamiento univoco en todas las variantes.

**Entregable esperado**: menor riesgo de regresion y base DRY.

## 8.3 Fase B (3-7 dias) - Pulido operativo admin

1. Unificar paginas `approved`/`rejected` en un componente base parametrizable.
2. Estandarizar componente de feedback (success/error/loading/empty) para admin.
3. Homologar confirmaciones y errores en acciones criticas.
4. Limpiar codigo no usado en modulos de metricas/analitica.

**Entregable esperado**: admin mas mantenible y menos "generico".

## 8.4 Fase C (7-14 dias) - Premium layer

1. Definir guia de motion/microinteracciones aplicable a todas las areas.
2. Ajustar consistencia visual de legales y secciones internas con shell global.
3. Mejorar accesibilidad en modales y flujos de teclado.
4. Refinar percepcion de fluidez en transiciones y feedback.

**Entregable esperado**: sensacion de producto premium coherente end-to-end.

## 9) Checklist de auditoria para el programador (usar como guion)

### 9.1 Arquitectura y datos

- [ ] Existe una sola ruta de verdad para mapear una oferta a UI.
- [ ] Los calculos de score/ranking se consumen igual en todas las pantallas.
- [ ] No hay fetches redundantes que dupliquen la misma informacion en una misma vista.
- [ ] Los guards de rol usan una estrategia comun.

### 9.2 UI/UX transversal

- [ ] Todas las pages tienen estados `loading/error/empty/success` consistentes.
- [ ] No se usan `alerts` abruptos en flujos operativos clave.
- [ ] Microinteracciones y transiciones siguen un mismo criterio.
- [ ] Se mantiene la identidad visual en publico y admin.

### 9.3 Operacion y mantenimiento

- [ ] Moderacion no tiene duplicidad estructural innecesaria.
- [ ] Logs/health/metrics tienen convencion de visualizacion comun.
- [ ] Owner panel mantiene claridad de prioridades y alertas.
- [ ] El sistema es entendible para nuevo dev en menos de 2 dias.

### 9.4 Calidad pre-lanzamiento

- [ ] No hay rutas criticas sin feedback de error claro.
- [ ] No hay regresiones visuales entre modo claro/oscuro en componentes clave.
- [ ] El flujo de usuario nuevo (descubre -> oferta -> registro -> me) es coherente.
- [ ] El flujo de moderador y owner no tiene bloqueos operativos ocultos.

## 10) Recomendacion final de lanzamiento

AVENTA ya no esta en etapa "idea". Esta en etapa de "producto funcional con potencial de escala".

Recomendacion:

- no hacer rework grande,
- ejecutar un polish tecnico/UX concentrado en coherencia transversal,
- lanzar con checklist de calidad cerrada y ownership claro por modulo.

Con esta estrategia, se maximiza:

- confianza de usuarios desde el dia 1,
- facilidad de mantenimiento para el equipo,
- percepcion de producto cuidado (no generico),
- capacidad de evolucionar sin romper base.

## 11) Anexo - contexto rapido para entrega a tercero

Si compartes este documento con un programador experto, acompanalо con:

1. Este archivo (auditoria pre-lanzamiento).
2. `docs/ESTABILIZACION_12_MESES.md`.
3. `docs/FASE0_BLINDAJE_SISTEMA.md`.
4. Prioridad de negocio (que no se debe romper): feed, moderacion, owner panel, comisiones.
5. Restriccion de trabajo: "mejorar sin rehacer diseno base".

---

Documento preparado para revision tecnica externa y plan de pulido pre-lanzamiento.
