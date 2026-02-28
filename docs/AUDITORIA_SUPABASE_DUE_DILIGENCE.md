# Auditoría Supabase AVENTA — Due diligence técnica (estado real)

**Fecha:** 28 febrero 2026  
**Fuente:** Esquema, políticas RLS, triggers, funciones, índices, publicaciones Realtime y estadísticas de filas exportados de Supabase.  
**Enfoque:** No se asume que nada está correcto. Evaluación para inversión.

---

## 1. Integridad estructural

### 1.1 Tablas y vistas

| Objeto | Tipo | Observación |
|--------|------|-------------|
| comments, offer_events, offer_favorites, offer_reports, offer_votes, offers, profiles, user_roles, moderation_logs | Tablas base | Core del negocio. |
| ofertas_ranked_general | Vista | Depende de offers; debe incluir `deleted_at IS NULL`. Coherente con uso en app. |
| ofertas_ranked_general_backup, ofertas_ranked_general_backup_20260223_055849 | Vista/backup | **Huérfanas.** Copias de seguridad dejadas en esquema public; sin uso en código. |
| public_profiles_view_backup | Vista/backup | **Huérfana.** Misma situación. |
| ofertas_scores, ofertas_scores_ranked | Vistas | Posible herencia de versiones antiguas; la app usa ofertas_ranked_general. Verificar si se usan. |
| daily_system_metrics | Tabla/vista | Métricas diarias; verificar si se rellenan y quién las usa. |
| offer_event_totals, offer_vote_totals | (no en listado de tablas 1) | Si son vistas, confirmar definición y uso. |
| offer_quality_checks | Tabla | **0 filas.** Tiene RLS (admin/moderator). No referenciada en código de la app. **Tabla huérfana / deuda.** |
| offer_performance_metrics | Materialized view | Tiene índice único por id. Función `refresh_offer_performance_metrics()` la refresca. Si no se llama en cron o desde app, datos obsoletos. |

### 1.2 Inconsistencias triggers vs columnas

- **offers.trigger_set_updated_at** (BEFORE UPDATE → set_updated_at()): La función asigna `NEW.updated_at = now()`. La tabla **offers** debe tener columna `updated_at`. En la publicación Realtime, `offers` incluye `updated_at` en attnames → columna existe. **Consistente.**
- **offer_votes:** Dos triggers actualizan conteos en `offers`:
  1. **offer_votes_counter_trigger** (AFTER INSERT/UPDATE/DELETE): actualiza por delta `upvotes_count`, `downvotes_count`, `votes_count`.
  2. **trg_offer_votes_recalculate** (AFTER INSERT/UPDATE/DELETE): ejecuta **offer_votes_recalculate_function**, que hace `UPDATE offers` con `SUM(CASE WHEN vote = 1 ... WHEN vote = -1 ...)` desde `offer_votes`. La columna **vote** existe como GENERATED ALWAYS AS (value) STORED (migración 020). **Consistente** en esquema.
- **Riesgo:** Los dos triggers escriben en las mismas columnas (`upvotes_count`, `downvotes_count`). El segundo sobrescribe al primero. Solo uno debería ser la fuente de verdad; tener los dos es redundante y puede generar confusión o bugs si uno se modifica y el otro no. **Deuda:** unificar en un único trigger (p. ej. solo recalculate o solo counter).
- **offer_events.trg_after_event_insert** → trigger_recalculate_after_event() → **recalculate_offer_metrics**(NEW.offer_id). Actualiza `offers` (votes_count, upvotes_count, downvotes_count, outbound_24h, ctr_24h, ranking_momentum). La función **recalculate_offer_metrics** usa `p_offer_id` y lee de `offer_votes` y `offer_events`; es la misma lógica que ranking. **Consistente.**

### 1.3 Columna `offers.votes_count`

- **offer_votes_counter_trigger** actualiza `votes_count` en offers.
- **recalculate_offer_metrics** también actualiza `votes_count`.
- **offer_votes_recalculate_function** no actualiza `votes_count`, solo up/down.
- Por orden de ejecución: en cada voto se ejecutan counter_trigger y luego recalculate_function; la función no toca votes_count, así que votes_count queda del counter_trigger. recalculate_offer_metrics (por eventos) sí vuelve a escribir votes_count. Múltiples fuentes de verdad para las mismas columnas → riesgo de desincronización a largo plazo.

---

## 2. Seguridad real y posibles bypass RLS

### 2.1 Políticas que permiten más de lo deseado

| Tabla | Política | Riesgo |
|-------|----------|--------|
| **offer_events** | offer_events_insert (roles anon, authenticated) WITH CHECK **(true)** | Cualquier cliente con anon key puede INSERT en offer_events con cualquier (offer_id, event_type, user_id). La app usa API con service_role, pero si alguien usa el cliente Supabase con anon key puede inflar eventos (p. ej. views/outbound) hasta el rate limit de PostgREST. **Bypass de intención:** RLS no restringe inserts anónimos. |
| **offer_events** | offer_events_select_authenticated USING **(true)** | Cualquier usuario autenticado puede SELECT todas las filas de offer_events (offer_id, user_id, event_type, created_at). **Exposición de datos analíticos:** ver qué ofertas vio o pulsó cada usuario. Para due diligence es un riesgo de privacidad y uso indebido. |

### 2.2 Inconsistencia de roles: owner excluido de moderación en offers

- **offers_update_owner_or_moderator** y **offers_delete_owner_or_moderator** usan la función **is_moderator()**.
- Definición de **is_moderator():** `ur.role = ANY (ARRAY['admin','moderator'])` — **no incluye 'owner'.**
- **user_has_moderation_role()** (usada en moderation_logs): incluye 'owner', 'admin', 'moderator'.
- **Consecuencia:** Un usuario con rol **owner** no puede actualizar ni borrar ofertas de otros usuarios vía RLS (solo las propias por created_by = auth.uid()). En la app, las APIs de moderación usan **service_role**, por lo que en la práctica el owner sí puede moderar. Pero si en el futuro se hiciera alguna operación con cliente authenticated contra offers, el owner quedaría limitado. **Inconsistencia crítica** entre modelo de roles (owner > admin) y RLS (owner no tratado como moderador en offers).

**Recomendación:** Incluir 'owner' en is_moderator() o crear is_owner_or_moderator() y usarla en las políticas de UPDATE/DELETE de offers.

### 2.3 profiles: lectura pública

- En el listado proporcionado solo aparecen políticas **profiles_select_own**, **profiles_update_own**, **profiles_insert_own**, **profiles_delete_own** (USING false).
- No se listó una política tipo "Perfiles públicos visibles para todos" (SELECT USING (true)) sobre **profiles**. Si no existe, los anon no pueden leer ninguna fila de profiles. La vista **public_profiles_view** (SELECT id, display_name, avatar_url FROM profiles) hereda RLS de la tabla subyacente; sin política que permita SELECT a anon, las lecturas anónimas a esa vista devolverían 0 filas. La app usa en su mayoría **service_role** en API para listados y joins (p. ej. ofertas con autor), por lo que en flujos actuales podría no fallar. **Riesgo:** Cualquier uso futuro desde cliente con anon key (p. ej. mostrar autor en oferta) fallaría o no mostraría nombres. Confirmar en Supabase si existe política de SELECT público en profiles o en la vista.

### 2.4 Duplicación de políticas (no bypass, pero ruido)

- **moderation_logs:** Dos conjuntos de nombres (moderation_logs_* con rol authenticated + "Moderadores pueden *" con public y user_has_moderation_role()). Misma intención; duplicación.
- **offer_reports:** moderators_can_view_reports y offer_reports_select_moderators; misma intención.
- **user_roles:** users_can_select_own_roles (authenticated) y "Usuarios ven su propio rol" (public). Para anon, auth.uid() es null, así que no hay filas. Redundancia.

### 2.5 comments INSERT

- WITH CHECK (auth.uid() = user_id **AND status = 'pending'**). El INSERT desde cliente authenticated solo puede crear con status pending. Correcto; no hay bypass.

---

## 3. Índices: innecesarios y faltantes

### 3.1 Redundancia

- **offer_votes:** idx_offer_votes_offer_id, offer_votes_offer_id_idx, idx_offer_votes_offer — varios índices sobre (offer_id). Uno compuesto con (offer_id, created_at) ya existe; los demás pueden ser redundantes salvo para consultas solo por offer_id.
- **offers:** idx_offers_ranking_momentum, idx_offers_ranking_momentum_desc, offers_ranking_momentum_idx, offers_ranking_momentum_idx — **varios índices sobre ranking_momentum.** Para listados ordenados por ranking_momentum DESC basta uno; el resto es mantenimiento extra en INSERT/UPDATE.
- **offers:** idx_offers_status y offers_status_idx; idx_offers_expires_at y offers_expires_at_idx — duplicados por columna.

### 3.2 Posibles full table scans y escala (100k ofertas, 1M votos)

- **Listado home:** consultas a vista que filtra por status, deleted_at IS NULL, expires_at, orden por ranking_momentum o created_at. Índices en (status, expires_at, created_at) y (ranking_momentum DESC) existen; si la vista no está materializada y hace JOINs pesados, a 100k filas el coste puede subir. **recalculate_offer_metrics** y triggers en cada voto: con 1M votos, cada INSERT/UPDATE/DELETE en offer_votes dispara dos triggers que hacen UPDATE a offers y, en uno de ellos, subconsultas COUNT sobre offer_votes. A gran escala puede ser punto caliente.
- **Faltante sugerido:** Para ofertas listadas por “visibles y no eliminadas”, un índice compuesto como (deleted_at, status, expires_at) WHERE deleted_at IS NULL podría ayudar. Ya existe idx_offers_status_expires_created; evaluar si incluir deleted_at en filtros de índices parciales.

---

## 4. Riesgos de escalabilidad (100k ofertas, 1M votos)

- **Triggers en offer_votes:** Por cada voto se ejecutan dos triggers que actualizan `offers`. Con 1M votos, 1M ejecuciones de cada trigger y UPDATEs a offers. Bloqueos breves y carga en CPU/IO.
- **offer_events:** 288 filas estimadas; crecimiento lineal con uso. Índices por (offer_id, event_type, created_at) adecuados. A millones de eventos, políticas SELECT USING (true) para authenticated exponen muchos datos; restringir a agregados o a filas propias.
- **Vistas no materializadas:** ofertas_ranked_general se calcula sobre la marcha; con 100k ofertas y filtros por tiempo/status, el plan debe usar índices. Monitorear tiempos de respuesta.
- **Materialized view offer_performance_metrics:** Si no se refresca con frecuencia, métricas desactualizadas. Definir estrategia de refresh (cron o post-moderation).

---

## 5. Colisión de roles y permisos

- **owner** no está en **is_moderator()** pero sí en **user_has_moderation_role()**. Quien asuma que “owner puede todo” verá que en RLS de offers (UPDATE/DELETE) el owner no puede modificar ofertas ajenas. Ya comentado en 2.2.
- **offer_votes:** offer_votes_owner_modify (ALL) y offer_votes_select_own_or_admin (SELECT). El primero ya permite SELECT para el propio usuario; el segundo añade admin/owner. Sin conflicto, pero duplicación de lógica.

---

## 6. Uso de service_role

- La app usa **service_role** en APIs de servidor (createServerClient) para: insertar ofertas, votos (vía API que valida JWT y luego escribe), comentarios, eventos, reportes, moderación, perfiles, etc. Con service_role se bypasea RLS.
- **Necesidad:** Correcta para operaciones que deben ejecutarse en nombre del sistema o tras validar lógica de negocio (Bearer + roles) en el servidor.
- **Riesgo:** Si en algún punto se expusiera service_role al cliente o se usara en un contexto no servidor, todo el RLS quedaría inútil. Revisar que ninguna variable de entorno con service_role llegue al bundle del cliente.
- **Dependencia frágil:** Toda la seguridad de escritura depende de que las APIs validen bien (token, roles). Un solo endpoint que confíe en el body para user_id/created_by sin validar token sería crítico. La auditoría de código ya revisó esto; en Supabase en sí no hay “bypass” adicional salvo los puntos RLS citados (offer_events insert/select).

---

## 7. Tablas/vistas huérfanas o sin uso

- **ofertas_ranked_general_backup**, **ofertas_ranked_general_backup_20260223_055849**, **public_profiles_view_backup:** Sin referencia en código. Eliminar en ciclo de release o documentar como backup manual.
- **offer_quality_checks:** 0 filas, RLS definido, no usado en app. Decidir: integrar flujo de calidad o eliminar tabla (y políticas).
- **ofertas_scores, ofertas_scores_ranked:** Verificar si la app o algún job las usa; si no, candidatas a limpieza.
- **daily_system_metrics:** Verificar si se rellena (trigger, job, función) y si algo la lee.

---

## 8. Funciones no usadas o de uso dudoso

- **offer_vote_summary(p_offer_id):** Devuelve up_votes, down_votes, score desde offer_votes. Posible uso en reportes o admin; si no se llama desde app ni desde otras funciones, es deuda.
- **get_user_vote(p_offer_id):** Devuelve el voto del usuario actual (auth.uid()). La app obtiene el voto vía API/select desde cliente; si no se usa esta función, es redundante.
- **compute_offer_risk_score(p_offer_id):** Lógica similar al trigger trigger_compute_risk_score. El trigger se ejecuta en INSERT; la función podría usarse para recalcular. Si nada la llama, es deuda.
- **refresh_offer_performance_metrics:** Necesaria si se usa la materialized view; si no se invoca en cron o desde admin, la vista queda obsoleta.

---

## 9. Publicaciones Realtime

- **supabase_realtime:** Incluye **offers** y **offer_votes** con listas de columnas explícitas. Coherente con useOffersRealtime que escucha UPDATE en offers.
- **supabase_realtime_messages_publication:** Tablas realtime.messages_2026_02_* y 03_* (mensajes internos de Realtime). Configuración estándar.
- No se detecta malconfiguración grave. El error de consola “WebSocket closed before connection established” suele ser de red o de orden de suscripción; la publicación en sí está correcta.

---

## 10. Resumen: riesgos críticos reales

1. **offer_events INSERT para anon (WITH CHECK true):** Cualquiera con anon key puede insertar filas en offer_events, inflando métricas hasta límites de PostgREST/API. Mitigación actual: la app solo escribe vía API con rate limit; el riesgo es uso directo del cliente Supabase con anon.
2. **offer_events SELECT para authenticated (USING true):** Cualquier usuario autenticado puede leer todos los eventos (qué oferta vio/pulsó quién). Riesgo de privacidad y uso indebido en due diligence.
3. **is_moderator() no incluye owner:** En RLS de offers (UPDATE/DELETE), el rol owner no puede modificar ofertas ajenas. Inconsistente con el modelo de roles y con el uso en app (APIs con service_role). Riesgo si en el futuro se ejecuta lógica con cliente authenticated contra offers.

---

## 11. Riesgos medios

1. **Dos triggers en offer_votes** actualizando upvotes_count/downvotes_count (y uno también votes_count): redundancia y posible desincronización; unificar en un solo trigger.
2. **Vistas/backups huérfanas** en public: ofertas_ranked_general_backup*, public_profiles_view_backup; limpieza recomendada.
3. **Políticas duplicadas** (moderation_logs, offer_reports, user_roles): sin impacto directo de seguridad; simplificar para mantener una sola fuente de verdad por operación/rol.
4. **Índices duplicados** en offers (ranking_momentum, status, expires_at): más mantenimiento en escritura; consolidar.
5. **Tabla offer_quality_checks** y funciones no invocadas (offer_vote_summary, get_user_vote, compute_offer_risk_score, refresh_offer_performance_metrics): deuda y posible confusión; documentar uso o eliminar.

---

## 12. Riesgos bajos

1. **profiles:** Si no existe política SELECT pública, cualquier lectura anónima de profiles o public_profiles_view devuelve vacío; confirmar y, si se desea perfil público, añadir política explícita.
2. **offer_performance_metrics:** Si no se refresca, datos desactualizados; bajo si no se usan para decisiones críticas.
3. **Estadísticas estimadas:** offer_reports 0, offer_quality_checks 0; coherente con uso actual.

---

## 13. Deuda técnica

- Unificar triggers de conteo de votos en offer_votes (un solo trigger que actualice offers).
- Incluir owner en is_moderator() o alinear políticas de offers con el modelo owner > admin > moderator.
- Eliminar o restringir offer_events_insert (anon) y offer_events_select (authenticated true); al menos limitar SELECT a agregados o a filas propias.
- Eliminar vistas backup y tablas/vistas no usadas (offer_quality_checks, ofertas_scores*, etc.) o documentar su propósito.
- Revisar funciones que no se llaman; eliminar o conectar a un flujo (cron, admin, reportes).
- Reducir índices redundantes en offers y offer_votes.

---

## 14. Recomendaciones estructurales

1. **RLS offer_events:**  
   - INSERT: eliminar política con WITH CHECK (true) para anon; dejar solo offer_events_insert_authenticated (user_id = auth.uid() OR user_id IS NULL).  
   - SELECT: sustituir USING (true) por una política que permita solo lectura de filas propias (user_id = auth.uid()) o solo acceso vía funciones que devuelvan agregados.

2. **Roles:** Añadir 'owner' a is_moderator() o crear política explícita para owner en UPDATE/DELETE de offers.

3. **Triggers offer_votes:** Mantener un único trigger AFTER INSERT/UPDATE/DELETE que actualice offers (p. ej. solo offer_votes_recalculate_function si incluye votes_count, o solo counter_trigger y eliminar el otro). Asegurar que recalculate_offer_metrics y ese trigger no escriban valores contradictorios en las mismas columnas.

4. **Limpieza:** Dropear vistas backup; marcar o dropear offer_quality_checks y vistas obsoletas; documentar daily_system_metrics y offer_performance_metrics (quién escribe, quién lee, refresh).

5. **Escala:** Con 100k ofertas y 1M votos, monitorear tiempo de triggers en offer_votes y plan de consultas a ofertas_ranked_general; valorar materializar la vista o particionar offer_events por tiempo.

---

## 15. Qué rompería el sistema en producción

- **Eliminar o cambiar columnas** a las que atan triggers o funciones (updated_at en offers, value/vote en offer_votes, deleted_at en offers) sin ajustar triggers/funciones.
- **Quitar offer_votes u offers de la publicación supabase_realtime** si el cliente depende de Realtime para ranking en vivo (pantallas en blanco o datos no actualizados).
- **Alterar is_moderator() o user_has_moderation_role()** sin alinear todas las políticas que las usan (offers, moderation_logs).
- **Borrar la política de INSERT en comments** con status = 'pending' podría permitir insertar comentarios ya aprobados.
- **Service_role key** comprometida o rotada sin actualizar en servidor: todas las escrituras vía API fallarían.
- **Eliminar la política anon de SELECT en offers** (offers_select_anon): la home pública dejaría de ver ofertas para usuarios no logueados.

---

## 16. ¿El modelo está listo para inversión técnica?

- **Sí con condiciones.** El esquema soporta el negocio actual (ofertas, votos, comentarios, eventos, moderación, perfiles, roles) y las políticas RLS, en conjunto con el uso de service_role en API, evitan la mayoría de los abusos directos desde el cliente. Los problemas identificados son:
  - Exposición y control de **offer_events** (INSERT anon y SELECT total para authenticated).
  - **Owner** no alineado con RLS en offers.
  - Redundancia de triggers y políticas, y objetos huérfanos.

- **Para un due diligence limpio** conviene: (1) corregir RLS de offer_events, (2) incluir owner en la lógica de moderación de offers, (3) unificar triggers de votos y (4) limpiar backups y tablas no usadas. Con eso el modelo queda sólido y comprensible para un auditor o inversor técnico.

---

*Documento basado en exportación real de Supabase (tablas, columnas, políticas, triggers, funciones, índices, publicaciones y estadísticas). No se asume que ninguna configuración previa sea correcta.*
