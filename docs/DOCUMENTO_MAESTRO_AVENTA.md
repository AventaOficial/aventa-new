# Documento Maestro AVENTA

Version: 2.0  
Fecha: 27-03-2026  
Audiencia principal: programador/a senior que entra al proyecto para auditoria, continuidad o hardening.

---

## 1) Objetivo de este documento

Este documento es la referencia operativa central de AVENTA para entender:

- arquitectura real del producto,
- funcion de cada area y cada ruta,
- botones/acciones relevantes y su impacto tecnico,
- APIs y contratos principales,
- reglas de negocio activas,
- riesgos y prioridades de mantenimiento.

No es un documento de marketing. Es una guia tecnica de trabajo para ejecutar sin ambiguedades.

---

## 2) Estado actual del sistema (lectura ejecutiva)

AVENTA tiene una base funcional fuerte para lanzamiento:

- feed principal con ranking consolidado,
- publicacion de ofertas con validacion de entrada,
- votacion/favoritos/eventos,
- perfiles, reputacion y comisiones iniciales,
- bloque admin/owner operativo,
- monitoreo de integridad y alertas.

Riesgo principal actual: no es falta de features, es consistencia transversal entre areas y disciplina de mantenimiento.

---

## 3) Arquitectura tecnica

## 3.1 Stack

- Frontend + backend HTTP: Next.js (App Router) en `app/`.
- Base de datos/Auth/Storage: Supabase (Postgres + RLS + Auth + Storage).
- Validacion de contratos: Zod en rutas API criticas.
- Tests: Vitest (contratos).
- Jobs programados: Vercel Cron.
- Alertas: webhook y/o email (Resend) para integridad.

## 3.2 Capas de la app

1. **UI Layer**
   - pages y componentes (cards, modales, barras, paneles).
2. **API Layer**
   - rutas `app/api/**/route.ts` con auth, validacion, negocio.
3. **Domain Layer**
   - helpers en `lib/**` (scoring, categorias, integridad, comisiones).
4. **Data Layer**
   - tablas, vistas, funciones SQL, indices, constraints.

## 3.3 Principio de contratos

El sistema se diseña con contratos explicitos:

- contrato de entrada API (Zod),
- contrato de dominio (formula de score, categorias, roles),
- contrato de persistencia (constraints SQL + migraciones),
- contrato operativo (integrity checks + alertas).

---

## 4) Mapa de areas de producto

## 4.1 Area publica (usuario final)

- `/` Home feed.
- `/oferta/[id]` Detalle de oferta.
- `/categoria/[slug]` Exploracion por categoria.
- `/tienda/[slug]` Exploracion por tienda.
- `/u/[username]` Perfil publico.
- `/descubre` Centro de guia y descubrimiento.
- `/extension` Instrucciones extension.

## 4.2 Area cuenta (usuario logueado)

- `/me` Panel personal (reputacion + comisiones + ofertas).
- `/me/favorites` Favoritos.
- `/settings` Configuracion.
- `/auth/reset-password` Recuperacion.

## 4.3 Area operacion owner

- `/operaciones` Centro de operaciones.
- `/contexto` Hub owner.
- `/mi-panel` Redirect owner.
- `/admin/owner` Redirect owner.

## 4.4 Area admin/moderacion

- `/admin/moderation` Cola pendiente.
- `/admin/moderation/approved`
- `/admin/moderation/rejected`
- `/admin/moderation/comments`
- `/admin/moderation/bans`
- `/admin/reports`
- `/admin/users`
- `/admin/team`
- `/admin/vote-weights`
- `/admin/announcements`
- `/admin/metrics`
- `/admin/health`
- `/admin/logs`
- `/admin/analista`

## 4.5 Area legal

- `/terms`
- `/privacy`

---

## 5) Dominios de negocio y reglas canonicas

## 5.1 Ofertas

- Entidad base de contenido.
- Ciclo de estado principal: `pending` -> `approved` o `rejected`.
- Campos clave: titulo, tienda, precio, categoria, imagen, cupn, MSI, tags.

## 5.2 Votos y score

- Formula canonica de score visible: `score = up*2 - down`.
- Helper canonico: `lib/offers/scoring.ts`.
- Valores de voto esperados: `2` (positivo), `-1` (negativo).

## 5.3 Categorias

- Canon en `lib/categories.ts`.
- Macros: `tecnologia|gaming|hogar|supermercado|moda|belleza|viajes|servicios|other`.
- Normalizacion de entrada obligatoria en API de ofertas.

## 5.4 Comisiones (estado actual)

- Regla de elegibilidad base activa:
  - 15 ofertas calificadas,
  - cada una con umbral de votos positivos definido.
- Activacion condicionada a aceptacion de terminos.
- Estado visible para usuario y para admin.

## 5.5 Integridad del sistema

- Servicio: `lib/server/systemIntegrity.ts`.
- Endpoint admin: `/api/admin/system-integrity` y alias `/api/admin/integrity-check`.
- Cron: `/api/cron/system-integrity`.
- Persistencia de snapshot: `app_config` (`system_integrity_last`).

---

## 6) Catalogo page-by-page ultra detallado

Formato por pagina:

- proposito,
- audiencia,
- partes UI principales,
- botones/acciones,
- datos/APIs,
- notas de mantenimiento.

---

### 6.1 `/` Home (`app/page.tsx`)

**Proposito**  
Pantalla principal de descubrimiento y conversion.

**Audiencia**  
Visitante y usuario logueado.

**Partes UI principales**

- encabezado/navegacion global,
- tabs de feed (dia a dia, top, para ti, recientes),
- buscador/filtros,
- lista de `OfferCard`,
- estados vacio/error/loading/skeleton.

**Botones/acciones**

- `Votar +`: envia voto positivo.
- `Votar -`: envia voto negativo.
- `Favorito`: toggle favorito.
- `Compartir`: comparte y/o registra evento.
- `Ir a oferta` o CTA de card: abre detalle o salida externa.
- `Cargar mas`: paginacion incremental.

**Datos/APIs**

- `/api/feed/home`
- `/api/feed/for-you`
- `/api/stores`
- `/api/app-config`
- datos auxiliares de favoritos/votos del usuario.

**Notas de mantenimiento**

- Es una de las paginas mas criticas y grandes.
- Cualquier cambio aqui debe pasar test funcional y visual.

---

### 6.2 `/oferta/[id]` Detalle (`app/oferta/[id]/page.tsx`)

**Proposito**  
Detalle completo de oferta y conversion final.

**Partes UI**

- metadata SEO + JSON-LD,
- contenido principal de oferta,
- comentarios y acciones sociales (desde componente de contenido).

**Botones/acciones frecuentes (segun contenido)**

- votar/favorito/compartir,
- salida a tienda,
- comentar/responder/reportar.

**Datos**

- fetch SSR de oferta por ID,
- render de contenido especializado.

**Notas**

- Ruta clave para SEO y confianza.
- Cualquier regresion aqui afecta conversion y posicionamiento.

---

### 6.3 `/categoria/[slug]` (`app/categoria/[slug]/page.tsx`)

**Proposito**  
Feed tematico por categoria.

**Botones/acciones**

- acciones de `OfferCard` (votos/favorito/salida/compartir).

**Datos**

- SSR/consulta de ofertas filtradas por categoria normalizada.

**Notas**

- Mantener consistencia de mapeo de oferta con Home.

---

### 6.4 `/tienda/[slug]` (`app/tienda/[slug]/page.tsx`)

**Proposito**  
Feed de ofertas por tienda.

**Botones/acciones**

- acciones de card identicas al resto de listados.

**Datos**

- consulta filtrada por tienda.

**Notas**

- Igual que categoria: preservar consistencia de campos y score.

---

### 6.5 `/u/[username]` Perfil publico (`app/u/[username]/page.tsx`)

**Proposito**  
Mostrar reputacion y aportes de un usuario.

**Partes UI**

- header de usuario,
- nivel/puntos reputacion,
- grid/lista de ofertas del autor.

**Botones/acciones**

- navegacion a oferta,
- interacciones sobre ofertas mostradas.

**Datos/APIs**

- `/api/profile/[username]`.

**Notas**

- Pagina clave para transparencia social y confianza de comunidad.

---

### 6.6 `/me` Panel personal (`app/me/page.tsx`)

**Proposito**  
Centro de control del usuario creador/miembro.

**Partes UI**

- bloque de identidad y reputacion,
- panel de comisiones (compacto/expandible),
- metricas de impacto,
- listado de ofertas propias.

**Botones/acciones**

- expandir/contraer panel comisiones,
- activar participacion (si elegible),
- navegar/gestionar contenido propio.

**Datos/APIs**

- `/api/me/impact-stats`
- `/api/me/commission-status`
- `/api/me/commissions-accept`
- datos de ofertas del usuario.

**Notas**

- Debe mantenerse simple y accionable.
- Es ruta de retencion clave para creadores.

---

### 6.7 `/me/favorites` (`app/me/favorites/page.tsx`)

**Proposito**  
Coleccion personal de ofertas guardadas.

**Botones/acciones**

- quitar/agregar favorito,
- votar/compartir/abrir oferta.

**Datos**

- consulta a favoritos del usuario + datos de oferta.

**Notas**

- Mantener comportamiento identico a cards del home.

---

### 6.8 `/settings` (`app/settings/page.tsx`)

**Proposito**  
Configuracion de perfil y preferencias.

**Partes UI**

- datos de perfil,
- preferencias de notificaciones/categorias.

**Botones/acciones**

- guardar cambios,
- toggles de preferencias.

**Datos/APIs**

- `/api/notifications/preferences`
- `/api/me/preferred-categories`
- perfil en Supabase.

**Notas**

- Errores de guardado deben ser visibles y claros.

---

### 6.9 `/auth/reset-password` (`app/auth/reset-password/page.tsx`)

**Proposito**  
Restablecer contrasena.

**Botones/acciones**

- enviar nueva contrasena.

**Datos**

- Supabase Auth.

**Notas**

- flujo sensible: UX de error/expiracion debe ser robusta.

---

### 6.10 `/descubre` (`app/descubre/page.tsx`)

**Proposito**  
Onboarding y guia de uso del producto.

**Botones/acciones**

- enlaces internos a secciones clave.

**Datos**

- mayormente estatico.

---

### 6.11 `/extension` (`app/extension/page.tsx`)

**Proposito**  
Instrucciones extension AVENTA.

**Botones/acciones**

- CTA para instalar/abrir recursos.

---

### 6.12 `/subir` (`app/subir/page.tsx`)

**Proposito**  
Ruta auxiliar de redireccion a flujo de subir oferta.

**Notas**

- no contiene UI compleja; sirve de deep link.

---

### 6.13 `/operaciones` (`app/operaciones/page.tsx`)

**Proposito**  
Panel owner para salud del sistema y decisiones rapidas.

**Partes UI**

- estado de integridad (cached/live),
- pulso operativo,
- recordatorios de mantenimiento,
- control owner de features (ej. tester offers).

**Botones/acciones**

- forzar chequeo de integridad,
- refrescar estado,
- toggles de config owner.

**Datos/APIs**

- `/api/admin/system-integrity`
- `/api/admin/operations-pulse`
- `/api/admin/app-config`.

**Notas**

- vista critica de "control tower".
- incluye refresco automatico.

---

### 6.14 `/contexto` (`app/contexto/page.tsx`)

**Proposito**  
Mapa owner de areas administrativas.

**Botones**

- accesos directos a modulos admin/owner.

**Datos**

- verificacion de rol owner.

---

### 6.15 `/mi-panel` y `/admin/owner`

**Proposito**  
Rutas de redireccion para mantener navegacion coherente.

---

### 6.16 `/admin/moderation` (`app/admin/moderation/page.tsx`)

**Proposito**  
Cola principal de moderacion de ofertas.

**Partes UI**

- filtros basicos,
- lista de pendientes,
- acciones por oferta,
- (segun rol) filtros avanzados y batch actions.

**Botones/acciones**

- aprobar oferta,
- rechazar oferta,
- expirar oferta,
- actualizar oferta,
- acciones masivas (owner/admin).

**Datos/APIs**

- endpoints admin de moderacion y preview.

**Notas**

- orientada a productividad operativa.
- alta prioridad de estabilidad.

---

### 6.17 `/admin/moderation/approved`

**Proposito**  
Historial/lista de ofertas aprobadas.

**Botones/acciones**

- buscar/filtrar,
- abrir detalle,
- acciones administrativas de seguimiento.

---

### 6.18 `/admin/moderation/rejected`

**Proposito**  
Historial/lista de rechazadas.

**Botones/acciones**

- buscar/filtrar,
- revisar razones y trazabilidad.

---

### 6.19 `/admin/moderation/comments`

**Proposito**  
Moderar comentarios de comunidad.

**Botones/acciones**

- ocultar/eliminar/moderar comentario,
- navegar a contexto de oferta.

---

### 6.20 `/admin/moderation/bans`

**Proposito**  
Gestion de bloqueos de usuario.

**Botones/acciones**

- banear,
- levantar ban,
- definir expiracion/razon.

---

### 6.21 `/admin/reports`

**Proposito**  
Cola de reportes de contenido.

**Botones/acciones**

- revisar reporte,
- moderar entidad reportada,
- cerrar caso.

---

### 6.22 `/admin/users`

**Proposito**  
Vista de usuarios para seguimiento y control.

**Partes UI**

- tabla de usuarios,
- estado de comisiones/elegibilidad,
- filtros basicos.

**Botones/acciones**

- inspeccionar usuario,
- acciones administrativas segun modulo asociado.

---

### 6.23 `/admin/team`

**Proposito**  
Gestion de miembros de equipo y roles.

**Botones/acciones**

- agregar miembro,
- asignar/cambiar rol,
- remover acceso.

---

### 6.24 `/admin/vote-weights`

**Proposito**  
Ajuste de multiplicador/peso de voto por usuario.

**Botones/acciones**

- setear multiplicador,
- guardar cambio.

---

### 6.25 `/admin/announcements`

**Proposito**  
Gestion de avisos de producto.

**Botones/acciones**

- crear aviso,
- editar aviso,
- eliminar aviso,
- publicar/activar.

---

### 6.26 `/admin/metrics`

**Proposito**  
Panel de metricas de producto.

**Botones/acciones**

- refrescar metricas,
- navegar segmentos/periodos.

---

### 6.27 `/admin/health`

**Proposito**  
Vista de salud tecnica/operativa.

**Datos**

- `daily_system_metrics` y/o endpoints internos.

---

### 6.28 `/admin/logs`

**Proposito**  
Auditoria de eventos administrativos.

**Botones/acciones**

- filtrar por fecha/actor/accion,
- inspeccionar trazas.

---

### 6.29 `/admin/analista`

**Proposito**  
Hub de analisis con accesos rapidos.

---

### 6.30 `/terms` y `/privacy`

**Proposito**  
Base legal de operacion de plataforma.

**Notas**

- deben permanecer alineadas con comportamiento real del producto.

---

## 7) Botones globales y su impacto tecnico

Esta seccion concentra "boton -> que dispara -> donde persiste".

## 7.1 Interaccion de oferta

- `Votar +` -> `POST /api/votes` -> tabla `offer_votes` -> recalculo/impacto score.
- `Votar -` -> `POST /api/votes` -> `offer_votes`.
- `Favorito` -> endpoint favoritos -> `offer_favorites`.
- `Compartir` -> tracking evento `share` en eventos.
- `Abrir oferta/Ir a tienda` -> tracking outbound.

## 7.2 Publicacion

- `Publicar oferta` -> `POST /api/offers` con schema Zod.
- validaciones: campos obligatorios, rangos de precios, normalizacion categoria/banco/tags.

## 7.3 Comentarios

- `Comentar` -> crea en `comments`.
- `Responder` -> reply en `comments`.
- `Like comentario` -> `comment_likes`.
- `Reportar` -> pipeline de reportes/moderacion.

## 7.4 Operacion owner

- `Ejecutar integridad ahora` -> `/api/admin/system-integrity?run=1` o `/api/admin/integrity-check?run=1`.
- `Toggle config` (ej. tester offers) -> `/api/admin/app-config`.

## 7.5 Moderacion/admin

- `Aprobar` -> endpoint admin moderation -> cambia estado oferta + logs.
- `Rechazar` -> endpoint admin moderation -> estado + razon + logs.
- `Expirar` -> endpoint de expiracion.
- `Actualizar oferta` -> endpoint admin update-offer.
- `Ban`/`Unban` -> endpoints de bans.
- `Crear/editar anuncio` -> endpoints announcements.

---

## 8) APIs criticas (contrato funcional)

## 8.1 Feed y discovery

- `/api/feed/home`
- `/api/feed/for-you`

Contrato esperado:

- parametros de consulta validados,
- respuesta consistente en campos de card,
- ordenamiento estable por criterio de ranking.

## 8.2 Ofertas

- `/api/offers` (crear oferta)
- `/api/offers/similar`
- rutas de comentarios en `/api/offers/[offerId]/comments/**`

## 8.3 Interacciones

- `/api/votes`
- `/api/track-view`
- `/api/track-outbound`
- `/api/events`

## 8.4 Perfil y cuenta

- `/api/profile/[username]`
- `/api/me/impact-stats`
- `/api/me/commission-status`
- `/api/me/commissions-accept`
- `/api/me/preferred-categories`
- `/api/notifications`
- `/api/notifications/preferences`

## 8.5 Admin/owner

- `/api/admin/system-integrity`
- `/api/admin/integrity-check` (alias)
- `/api/admin/operations-pulse`
- `/api/admin/users`
- `/api/admin/team`
- `/api/admin/vote-weight`
- `/api/admin/reports`
- `/api/admin/moderate-offer`
- `/api/admin/update-offer`
- `/api/admin/expire-offer`
- `/api/admin/comments`
- `/api/admin/bans`
- `/api/admin/announcements`
- `/api/admin/logs`
- `/api/admin/product-metrics`

---

## 9) Seguridad, roles y control de acceso

Roles usados en producto:

- `owner`
- `admin`
- `moderator`
- usuario estandar (sin rol administrativo).

Guardas importantes:

- `requireOwner` para rutas owner sensibles.
- `requireAdmin`/lógica de permisos en rutas admin.
- checks de sesion para usuario logueado en operaciones de escritura.

Regla practica:

- todas las acciones de impacto operacional deben validar rol servidor, no solo cliente.

---

## 10) Observabilidad e integridad operativa

## 10.1 Integridad automatica

Servicio: `lib/server/systemIntegrity.ts`

Checks incluyen (resumen):

- mapeo de categorias,
- integridad categoria/bank_coupon en ofertas,
- campos requeridos y logica de precio,
- validez de votos y deteccion legacy,
- consistencia score en vista de ranking,
- smoke test de feed,
- imagen principal y rango MSI.

## 10.2 Ejecucion

- manual owner: `GET /api/admin/integrity-check?run=1`
- cron: `GET /api/cron/system-integrity`

## 10.3 Alertas

Env vars relevantes:

- `SYSTEM_ALERT_WEBHOOK_URL`
- `SYSTEM_ALERT_EMAIL_TO`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CRON_SECRET`

---

## 11) Base de datos y migraciones clave

Migraciones relevantes para continuidad:

- `docs/supabase-migrations/categories_unification_bank_coupon_tags.sql`
- `docs/supabase-migrations/commissions_program_profiles.sql`
- `docs/supabase-migrations/final_hardening_constraints.sql`
- `docs/supabase-migrations/launch_scale_indexes.sql`
- `docs/supabase-migrations/offer_votes_unique_and_count_note.sql`
- `docs/supabase-migrations/offer_votes_allow_value_2.sql`
- `docs/supabase-migrations/view_ranking_blend.sql`

Regla de trabajo:

- toda regla de dominio critica termina en DB (constraint/index/view) y en API (schema/validacion).

---

## 12) Flujo funcional extremo a extremo (resumen para onboarding tecnico)

## 12.1 Publicar oferta

1. Usuario abre modal de subida.
2. Captura datos y confirma.
3. `POST /api/offers` valida entrada (Zod).
4. Normaliza categoria/banco/tags.
5. Persiste oferta con estado segun reglas (pending/auto-approved por reputacion).
6. Oferta aparece en colas/feed segun estado.

## 12.2 Votar oferta

1. Usuario toca voto en card/detalle.
2. `POST /api/votes`.
3. Persistencia en `offer_votes`.
4. Recalculo y reflejo de score/ranking.
5. UI se actualiza.

## 12.3 Moderar oferta

1. Moderador abre cola.
2. Revisa contexto.
3. Aprueba/rechaza/expira/edita.
4. Se registra log y cambia estado.
5. Feed y visibilidad cambian en consecuencia.

## 12.4 Activar comisiones

1. Usuario consulta estado de elegibilidad en `/me`.
2. Si cumple regla, puede aceptar terminos.
3. `POST /api/me/commissions-accept`.
4. Se guarda aceptacion/version.
5. Admin puede ver estado en `admin/users`.

## 12.5 Operar como owner

1. Owner abre `/operaciones`.
2. Revisa semaforos de integridad/pulso.
3. Ejecuta check live si hace falta.
4. Ajusta configuraciones controladas.
5. Decide acciones de mantenimiento.

---

## 13) Riesgos tecnicos activos y controles

## 13.1 Riesgos principales

- divergencia por logica repetida en varios listados,
- deuda visual/operativa en bloque admin,
- crecimiento de complejidad en home,
- desalineacion potencial entre docs y estado real de DB.

## 13.2 Controles ya implementados

- contratos Zod en APIs criticas,
- scoring canonico compartido,
- checks de integridad automáticos,
- tests de contrato,
- constraints SQL de hardening final.

## 13.3 Controles recomendados continuos

- gate de release: test contratos + build + integridad en verde,
- revision semanal owner del panel operaciones,
- auditoria mensual de consistencia cross-page.

---

## 14) Checklist para el programador que toma el proyecto

## 14.1 Primeras 2 horas

- [ ] correr `npm install`
- [ ] correr `npm run test:contracts`
- [ ] correr `npm run build`
- [ ] revisar `docs/BLINDAJE_FINAL_LANZAMIENTO.md`
- [ ] revisar migraciones pendientes en Supabase

## 14.2 Primer dia

- [ ] validar rutas core (`/`, `/oferta/[id]`, `/me`, `/operaciones`)
- [ ] probar endpoints criticos con datos reales de staging/prod
- [ ] ejecutar `GET /api/admin/integrity-check?run=1`
- [ ] revisar bloque admin/moderacion completo

## 14.3 Primera semana

- [ ] cerrar duplicidades tecnicas prioritarias (mappers/shared helpers)
- [ ] estandarizar estados UI admin (loading/error/success)
- [ ] documentar runbook de incidentes (feed caido, integridad en rojo, etc.)

---

## 15) Convenciones y reglas de mantenimiento

- No introducir nuevas reglas de negocio sin contrato escrito.
- No dejar logica critica solo en frontend.
- No fusionar cambios de feed/votos/comisiones sin pruebas de contrato.
- Cualquier cambio en reglas de moderacion debe dejar traza y actualizar docs.
- Cualquier cambio legal debe reflejarse en comportamiento de UI/API.

---

## 16) Mapa de archivos clave (arranque rapido)

Core producto:

- `app/page.tsx`
- `app/oferta/[id]/page.tsx`
- `app/me/page.tsx`
- `app/me/favorites/page.tsx`
- `app/settings/page.tsx`

Componentes de experiencia:

- `app/components/Navbar.tsx`
- `app/components/OfferCard.tsx`
- `app/components/ActionBar.tsx`
- `app/components/CookieNotice.tsx`

APIs core:

- `app/api/offers/route.ts`
- `app/api/votes/route.ts`
- `app/api/feed/home/route.ts`
- `app/api/feed/for-you/route.ts`
- `app/api/profile/[username]/route.ts`
- `app/api/me/commission-status/route.ts`
- `app/api/me/commissions-accept/route.ts`

Admin/owner:

- `app/operaciones/page.tsx`
- `app/api/admin/system-integrity/route.ts`
- `app/api/admin/integrity-check/route.ts`
- `lib/server/systemIntegrity.ts`
- `app/admin/moderation/page.tsx`
- `app/admin/users/page.tsx`

Dominio y contratos:

- `lib/offers/scoring.ts`
- `lib/offers/feedService.ts`
- `lib/categories.ts`
- `lib/bankCoupons.ts`
- `lib/contracts/offers.ts`
- `lib/contracts/votes.ts`
- `lib/contracts/feed.ts`
- `lib/server/commissionEligibility.ts`

Documentos y migraciones:

- `docs/ESTABILIZACION_12_MESES.md`
- `docs/FASE0_BLINDAJE_SISTEMA.md`
- `docs/BLINDAJE_FINAL_LANZAMIENTO.md`
- `docs/AUDITORIA_PRELANZAMIENTO_PAGE_BY_PAGE.md`
- `docs/supabase-migrations/final_hardening_constraints.sql`

---

## 17) Definicion de listo para lanzamiento

Un lanzamiento se considera habilitado si:

1. tests de contrato pasan,
2. build de produccion pasa,
3. integridad live `failed=0` o fallos no criticos documentados,
4. migraciones de hardening aplicadas,
5. owner entiende estado del sistema desde `/operaciones`,
6. rutas core y admin criticas fueron verificadas manualmente.

---

## 18) Cierre

Este documento existe para evitar dependencias de "memoria del fundador".
Si se mantiene vivo y alineado con codigo/DB, AVENTA puede escalar con menos friccion,
menos regresiones y mejor velocidad de equipo.

Mantener actualizado este archivo despues de cada fase importante es obligatorio.

# Documento Maestro AVENTA

Versión: 1.0  
Fecha: 2026-03-27  
Objetivo: visión integral del sistema (arquitectura, esquemas, flujos, botones, gamificación, monetización y riesgos).

---

## 1) Resumen ejecutivo

AVENTA hoy tiene una base sólida en:
- Feed de ofertas con ranking (`ofertas_ranked_general`).
- Reputación por usuario (`reputation_score`, `reputation_level`).
- Moderación, admin y métricas de actividad.
- Tracking de vistas / salidas / compartidos.

Los ejes a fortalecer para escalar sin errores caros:
- Unificar reglas de dominio en una sola fuente de verdad (categorías ya encaminado).
- Formalizar gamificación (medallas, progreso, eventos).
- Formalizar monetización por niveles (comisiones reales, ledger, conciliación).
- Elevar observabilidad, anti-fraude y pruebas de contrato.

---

## 2) Arquitectura general

### 2.1 Stack
- Frontend/Backend: Next.js (App Router, `app/`).
- Datos/Auth/Storage: Supabase (Postgres + RLS + Storage).
- Jobs: rutas cron (`/api/cron/daily-digest`, `/api/cron/weekly-digest`).
- UI global: `ClientLayout`, `Navbar`, `ActionBar`, providers (auth/theme/UI).

### 2.2 Superficie principal
- Home: `app/page.tsx`
- Detalle oferta: `app/oferta/[id]/page.tsx`, `OfferPageContent.tsx`
- Categoría: `app/categoria/[slug]/page.tsx`
- Tienda: `app/tienda/[slug]/page.tsx`
- Perfil público: `app/u/[username]/page.tsx`
- Mis áreas: `app/me/page.tsx`, `app/me/favorites/page.tsx`, `app/settings/page.tsx`
- Admin: `app/admin/**`

### 2.3 Capa API (por dominio)
- Feed: `app/api/feed/home`, `app/api/feed/for-you`
- Ofertas y comentarios: `app/api/offers`, `app/api/offers/[offerId]/comments/**`
- Interacciones: `app/api/votes`, `app/api/events`, `app/api/track-view`, `app/api/track-outbound`
- Usuario: `app/api/profile/[username]`, `app/api/me/**`, `app/api/notifications/**`
- Admin: `app/api/admin/**`

---

## 3) Esquemas de datos (alto nivel funcional)

> Nota: esto describe comportamiento y campos usados por código. La fuente final de DDL está en migraciones SQL.

### 3.1 Núcleo
- `offers`: oferta principal (precio, tienda, categoría, estado, autor, ranking, expiración, etc.).
- `profiles`: perfil público + reputación + preferencias + tags de afiliación.
- `offer_votes`: votos de usuarios.
- `offer_favorites`: favoritos.
- `comments`, `comment_likes`: discusión y utilidad social.
- `offer_events`: eventos (`view`, `outbound`, `share`).

### 3.2 Vistas y soporte
- `ofertas_ranked_general`: feed consolidado para home/categoría/tienda.
- `public_profiles_view`: datos públicos de autor (nombre/avatar/badges).

### 3.3 Campos nuevos de dominio (ya contemplados)
- `offers.category` canónica: `tecnologia|gaming|hogar|supermercado|moda|belleza|viajes|servicios|other`
- `offers.bank_coupon`: banco del cupón.
- `offers.tags`: etiquetas libres de producto/tema/tienda.

Migración principal:
- `docs/supabase-migrations/categories_unification_bank_coupon_tags.sql`

---

## 4) Botones y acciones clave (qué hacen y qué guardan)

## 4.1 Home y cards
- `Cazar oferta` (card/modal):
  - Abre detalle o va a URL de tienda.
  - Registra outbound (`offer_events`).
- `Votar arriba/abajo`:
  - Escribe en `offer_votes`.
  - Afecta score/ranking vía lógica SQL/triggers.
- `Favorito`:
  - Inserta/elimina en `offer_favorites`.
- `Compartir`:
  - Copia enlace / canales.
  - Registra evento `share` en `offer_events`.

## 4.2 Subir oferta (ActionBar modal)
- Campos obligatorios: título, precio, categoría, tienda.
- Opcionales: URL, descripción, pasos, condiciones, cupones, MSI, imágenes.
- Nuevos opcionales:
  - `Cupón bancario` -> `offers.bank_coupon`
  - `Etiquetas` -> `offers.tags`
- Guarda por `POST /api/offers`.

## 4.3 Comentarios en oferta
- Crear comentario/reply: `comments`.
- Like comentario: `comment_likes`.
- Reportar comentario/oferta: tablas de reportes y cola de moderación.

## 4.4 Navbar / atajos móvil
- Atajos móvil: Inicio, Descubre, Subir, Favoritos, Perfil.
- `Descubre` activado para móvil en `app/components/ActionBar.tsx`.

---

## 5) Categorías: estado actual y contrato recomendado

### 5.1 Contrato vigente recomendado
- UI muestra macros de `lib/categories.ts`.
- Escritura: toda categoría se normaliza con `normalizeCategoryForStorage`.
- Lectura/filtros: usar solo `getValidCategoryValuesForFeed` y helpers del mismo módulo.

### 5.2 Regla operativa
- Macro categoría y tags deben ser cosas separadas:
  - `category` = clasificación macro estable para negocio/feeds.
  - `tags` = detalle libre (PlayStation, iPhone, banco, etc.).

---

## 6) Gamificación actual (lo que ya existe)

### 6.1 Reputación y niveles
- `reputation_score`, `reputation_level` en `profiles`.
- Cálculo principal vía RPC SQL `recalculate_user_reputation`.
- Efectos actuales:
  - Umbrales de nivel.
  - Auto-aprobación de comentarios/ofertas según nivel.
  - Peso de voto por nivel.

### 6.2 Qué sí existe en UI
- Barra de reputación y nivel en perfil.
- Badges de líder (`leader_badge`) desde perfil público.
- Badge `Destacada` por calidad de oferta (`ranking_blend`).

### 6.3 Qué no existe aún
- Sistema de medallas formal con reglas, progreso y desbloqueos persistidos.
- Catálogo de logros en perfil.
- Motor de “misiones” o temporadas.

---

## 7) Monetización actual (real) vs futura

### 7.1 Hoy
- Se rastrean eventos y clics.
- Hay tagging para Mercado Libre (`ml_tracking_tag` -> parámetro `tag`).
- No hay ledger de comisiones por usuario ni liquidación automática.

### 7.2 Objetivo recomendado
- Crear ledger de ingresos atribuibles por usuario/oferta/período.
- Separar:
  - ingresos brutos,
  - fee plataforma,
  - comisión creador según nivel vigente.
- Conciliación por import/API de afiliados (no manual).

---

## 8) Propuesta AVENTA (no copia) para niveles + comisiones

### 8.1 Definiciones base
- `trust_tier` (confianza): usado para moderación/peso de voto.
- `creator_tier` (monetización): usado para reparto de comisiones.
- Puede iniciar acoplado y luego separarse.

### 8.2 Regla que pediste (formalizada)
- Nivel 1 (entrada monetizable):
  - “primeras 15 ofertas son nuestras” -> tratar como `origin = aventa_editorial`.
  - Condición de paso: completar ese tramo editorial definido por regla.
- Nivel 2:
  - Subir 15 ofertas de comunidad que alcancen 120 votos.
  - Definir técnicamente qué es “120 votos”:
    - Opción A: `up_votes >= 120`
    - Opción B: `score >= 120`
  - Recomendación: elegir una y congelarla en contrato.

### 8.3 Modelo de datos recomendado
- `offers.origin`: `aventa_editorial | community`
- `profiles.creator_tier`
- `creator_tier_progress` (o vista calculada)
- `commission_ledger` / `revenue_attributions`
- `creator_payouts` (cortes y estado de pago)

### 8.4 Reparto sugerido (ejemplo conceptual)
- Nivel 1: % menor al creador, % mayor plataforma.
- Nivel 2: % mayor al creador.
- Regla de snapshot: el tier que aplica es el del momento del evento de ingreso.

---

## 9) Propuesta de medallas AVENTA (identidad propia)

> Evitar clon directo. Mantener lógica familiar pero marca propia.

### 9.1 Estructura
- `badge_definitions`
- `user_badges`
- `badge_events` (auditoría)
- (Opcional) `badge_progress`

### 9.2 Familias de medallas
- Comunidad: comentarios útiles, respuestas, ayuda.
- Cazador: ofertas aprobadas, ofertas destacadas, constancia semanal.
- Calidad: CTR sostenido, baja tasa de rechazo, feedback positivo.
- Impacto: usuarios ayudados, outbound real.
- Especiales: campañas temporales y retos de temporada.

### 9.3 Reglas anti-fraude mínimas
- Caps diarios por tipo de evento.
- Detección de anillos de votos.
- Umbrales de calidad para validar medallas de alto nivel.
- Reversión administrativa de medallas/puntos con traza.

---

## 10) Plan de implementación por fases

### Fase 0 (estabilización)
- Congelar contratos de categoría/tags/bank_coupon.
- Pruebas de contrato en API feed/ofertas.
- Alertas de errores por ruta crítica.

### Fase 1 (base monetización)
- Añadir `offers.origin`, `profiles.creator_tier`, progreso.
- Endpoint `GET /api/me/creator-tier`.
- UI simple de progreso en perfil.

### Fase 2 (ledger comisiones)
- Ingesta ingresos afiliados.
- `commission_ledger` + panel admin de conciliación.
- Primer reporte mensual de prueba.

### Fase 3 (medallas AVENTA)
- Catálogo inicial 8-12 medallas.
- Unlock por jobs/eventos.
- Vitrina en perfil y notificación de desbloqueo.

### Fase 4 (optimización)
- Ajuste de thresholds por data real.
- Experimentos A/B de engagement.
- Endurecer anti-fraude.

---

## 11) Riesgos críticos a controlar

- Ambigüedad de reglas (“120 votos” sin definición técnica única).
- Doble camino de eventos (`track-outbound` y `events`) sin contrato único.
- Falta de ledger auditable para pagos (riesgo legal/financiero).
- Acoplar gamificación a métricas manipulables sin anti-fraude.
- Desalineación docs vs schema real en producción.

---

## 12) Checklist operativo de validación continua

Complementar con:
- `docs/CHECKLIST_SISTEMA_VIVO.md`

Revisión semanal mínima:
- Integridad de categorías y filtros.
- Integridad de eventos y métricas.
- Calidad de moderación y reputación.
- Salud de APIs críticas.
- Estado de migraciones entre entornos.

---

## 13) Decisiones pendientes (para cerrar arquitectura)

- Definición oficial de “120 votos”.
- Definición exacta de “primeras 15 ofertas son nuestras” en dato (`origin` + criterio temporal).
- Tabla final de reparto de comisiones por nivel.
- Catálogo inicial de medallas AVENTA y criterios.
- Política de pago (frecuencia, umbral mínimo, soporte de incidencias).

---

## 14) Archivos clave para mantenimiento

- `lib/categories.ts`
- `app/api/offers/route.ts`
- `app/api/feed/home/route.ts`
- `app/api/feed/for-you/route.ts`
- `app/components/ActionBar.tsx`
- `app/components/OfferCard.tsx`
- `app/page.tsx`
- `docs/supabase-migrations/categories_unification_bank_coupon_tags.sql`
- `docs/CHECKLIST_SISTEMA_VIVO.md`

