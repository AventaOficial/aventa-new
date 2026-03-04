# Análisis de sistemas AVENTA — nivel producción

Análisis profundo de cada sistema del proyecto: qué tienen bien, fallos detectados, riesgos y mejoras. Solo análisis; no se modifica código.

Resultado de la auditoría final de Supabase incluido (función, triggers, vista, Realtime).

---

## Resultado de la auditoría Supabase (cierre)

| Elemento | Estado | Detalle |
|----------|--------|---------|
| `recalculate_offer_metrics` | ✅ Correcto | upvotes_count = COUNT(value IN 1,2); downvotes_count = COUNT(value = -1); ranking_momentum = (up*2) - down. Actualiza `offers`. |
| Triggers en `offer_votes` | ✅ Correctos | Dos triggers AFTER INSERT/UPDATE/DELETE: `trg_offer_votes_recalculate` (→ recalculate_offer_metrics) y `offer_votes_reputation_weighted_trigger` (→ reputation_weighted_score). |
| Vista `ofertas_ranked_general` | ✅ Correcta | score = COALESCE(upvotes_count,0)*2 - COALESCE(downvotes_count,0). score_final con decay temporal. ranking_blend = ranking_momentum + reputation_weighted_score. |
| CHECK en `offer_votes.value` | ✅ Corregido | Ahora permite (2, 1, -1). Causa raíz de "los votos no se guardan" resuelta. |
| UNIQUE (offer_id, user_id) | ✅ Creado | `offer_votes_offer_user_unique`. |
| Realtime en `offers` | ⚠️ Verificar en panel | Los triggers hacen UPDATE en `offers`; si Realtime está habilitado para `offers` en el Dashboard, los clientes reciben los cambios. No hay llamadas explícitas a `realtime.broadcast_changes`. |
| Advertencia de seguridad | ⚠️ Revisar | Vistas con SECURITY DEFINER (incl. `ofertas_ranked_general`) y funciones con `search_path` mutable. Revisar si exponen datos a roles públicos de manera no intencionada. |

---

## 1. Sistema de votos

### Lo que está bien
- Arquitectura sólida: optimistic UI → API → trigger → Realtime → UI actualizada. Es el patrón correcto.
- Toggle (dar/quitar voto) implementado correctamente: mismo value = DELETE, distinto = UPDATE.
- onVoteChange sincroniza voteMap del padre tras confirmación del servidor.
- La API valida UUID, value (solo 2 o -1) y rate limit por IP.
- Notificación al dueño de la oferta al recibir like (fire-and-forget, no bloquea).

### Fallos detectados

**Crítico — Fórmula del score inconsistente en /me y perfil público:**
- `app/me/page.tsx` y `app/me/favorites/page.tsx` calculan `score = up - down`.
- `app/api/profile/[username]/route.ts` calcula `score = up - down`.
- El home y la vista en BD usan `score = up * 2 - down`.
- Resultado: el mismo usuario ve un score distinto en "Mis ofertas" vs en el feed. Un usuario con 5 upvotes y 1 downvote ve score 4 en /me pero 9 en el home.

**Medio — API devuelve 200 con ok: false en todo tipo de error:**
- Si no hay token, si el token es inválido, si falta configuración de Supabase, si falla la BD: todo devuelve `{ ok: false }` con status 200.
- El frontend no puede distinguir "no estás logueado" de "error del servidor".
- En producción esto dificulta el debugging; el usuario ve el mismo síntoma para problemas completamente distintos.

**Medio — Realtime re-ordena solo por ranking_momentum:**
- `useOffersRealtime` re-ordena la lista por `ranking_momentum` al recibir un UPDATE.
- Pero el feed inicial se ordena por `ranking_blend` (que incluye `reputation_weighted_score`).
- Tras un voto en tiempo real, el orden puede cambiar de forma distinta a como lo haría el feed fresco.

**Bajo — userVote: 0 vs null:**
- El OfferModal recibe `userVote={voteMap[id] ?? 0}` y el OfferCard recibe `userVote={voteMap[id] ?? null}`. Ambos significan "sin voto" pero el tipo es distinto. Funciona, pero no es limpio.

### Mejoras nivel producción
- Unificar la fórmula del score en todos los archivos: `up * 2 - down`. Sin excepciones.
- Diferenciar respuestas de error en la API: 401 si no hay token/inválido, 500 si falla BD, 200 solo si ok: true. El frontend puede mostrar mensajes distintos.
- Que Realtime re-ordene por `ranking_blend` (no solo momentum) o que no re-ordene y deje la posición estable hasta que el usuario recargue o cambie de pestaña.
- Unificar `userVote` como `1 | -1 | 0` en todos los sitios.

---

## 2. Sistema de ofertas (creación, feed, ranking)

### Lo que está bien
- El feed usa una vista materializada (`ofertas_ranked_general`) con ranking_blend: combina popularidad (votos, momentum) con calidad del creador (reputation). Esto es lo que hace que ofertas de usuarios confiables suban. Buen diseño.
- Filtros de status y expiración aplicados consistentemente en feed, perfil público, stores, búsqueda y ofertas similares.
- Auto-aprobación para usuarios nivel ≥ 3: reduce carga de moderación sin perder calidad.
- Búsqueda con expansión de términos (ej. "apple" también busca "iphone", "mac"): muy útil para UX.
- Paginación cursor-based en "Recientes" y por límite en otras vistas.

### Fallos detectados

**Crítico — "Para ti" no es personalizado:**
- La pestaña "Para ti" usa la misma query que "Recientes" (orden por `created_at` DESC). No hay personalización basada en votos, favoritos o historial del usuario.
- Si alguien activa "Para ti" esperando recomendaciones, ve lo mismo que en "Recientes". Eso rompe la expectativa y puede hacer que la feature se sienta vacía.

**Alto — Link directo `/?o=<id>` no filtra por status ni expiración:**
- Si alguien comparte un enlace de una oferta rechazada o expirada, el usuario puede verla. La query de oferta individual va a `offers` directamente, sin `.or('status.eq.approved,status.eq.published')`.
- Riesgo: un usuario comparte link a una oferta que fue rechazada por ser spam o engañosa, y otros la ven sin saber que fue vetada.

**Alto — /me muestra todo sin indicador de estado:**
- El perfil propio no filtra por status ni expires_at. Ofertas rechazadas, expiradas o pendientes aparecen mezcladas con las aprobadas, sin etiqueta de estado.
- El usuario no sabe si su oferta está visible para los demás, pendiente de revisión o vetada.

**Medio — Categoría requerida en formulario pero opcional en API:**
- El ActionBar puede bloquear el submit si falta categoría, pero la API la acepta como opcional. Inconsistencia que puede causar confusión si alguien usa la API directamente.

**Medio — image_url no validada en la API de ofertas:**
- La API no verifica que `image_url` o `image_urls` vengan de dominios permitidos o del bucket `offer-images`. Se podría insertar una URL arbitraria como imagen de una oferta.

### Mejoras nivel producción
- "Para ti": implementar personalización real basada en historial de votos, favoritos, categorías frecuentes o tiendas preferidas. Mientras tanto, renombrarlo a algo como "Feed" o quitarlo para no generar expectativa falsa.
- Link directo: aplicar los mismos filtros de status/expiración que el feed. Si la oferta no está visible, mostrar un mensaje tipo "Esta oferta ya no está disponible".
- /me: mostrar estado de cada oferta (Aprobada, Pendiente, Rechazada, Expirada) con badge o indicador visual.
- Validar que `image_url` provenga de `offer-images` de Supabase Storage o de un dominio permitido.

---

## 3. Sistema de moderación y reportes

### Lo que está bien
- Cola de pendientes con filtros por búsqueda, tienda, categoría, rango de fecha y riesgo. Herramientas completas para mods.
- Al aprobar: auto-expiración a 7 días si no tenía fecha. Esto mantiene el feed fresco.
- Notificación al creador al aprobar/rechazar/expirar. Transparencia con el usuario.
- Reportes con tipos predefinidos (precio_falso, no_es_oferta, expirada, spam, afiliado_oculto, otro) y comentario obligatorio de mínimo 100 caracteres.
- Moderación de comentarios separada (approve/reject) con auto-aprobación por nivel de reputación.

### Fallos detectados

**Alto — Posible doble conteo de reputación:**
- `moderate-offer` llama a `recalculateUserReputation(createdBy)`.
- Después, la UI de moderación también llama a `/api/reputation/increment-approved` o `increment-rejected`.
- Si el RPC `recalculate_user_reputation` ya incluye esos contadores, la reputación se suma dos veces. Esto puede inflar o desinflar la reputación del usuario.

**Medio — Reportes duplicados:**
- Un usuario puede reportar la misma oferta varias veces. No hay CHECK de unicidad por (offer_id, reporter_id) ni en BD ni en la API.
- Riesgo: un usuario molesto envía 10 reportes sobre la misma oferta, inflando la cola de pendientes.

**Medio — Batch de moderación sin rollback:**
- Aprobar/rechazar/expirar en batch ejecuta una operación por oferta secuencialmente. Si falla la tercera de cinco, las dos primeras ya cambiaron pero las tres restantes no. No hay transacción atómica.

**Bajo — Mínimo de 100 caracteres en comentario de reporte:**
- Un reporte legítimo como "La oferta dice $500 pero la tienda cobra $1200" tiene ~55 caracteres. El mínimo obliga a rellenar texto innecesario.

### Mejoras nivel producción
- Revisar si `recalculateUserReputation` y las APIs de `increment` usan los mismos contadores; si sí, quitar la llamada duplicada. Elegir una fuente de verdad.
- Añadir UNIQUE en `offer_reports(offer_id, reporter_id)` o un CHECK en la API para evitar reportes duplicados del mismo usuario.
- Reducir el mínimo de caracteres del comentario de reporte (ej. 20–30 chars).
- Considerar batch atómico o mostrar al mod qué ofertas fallaron.

---

## 4. Sistema económico / reputación

### Lo que está bien
- Diseño coherente: acciones positivas suman, negativas restan, niveles desbloquean privilegios (auto-aprobación).
- Pesos de voto por nivel de reputación (ej. nivel 4 = voto vale 3 en vez de 2): incentiva a usuarios confiables a participar.
- reputation_weighted_score se recalcula en tiempo real por trigger; no hay cálculo batch que pueda quedar desactualizado.

### Fallos detectados

**Alto — Doble conteo (ya mencionado en moderación):**
- La UI de moderación llama tanto a `recalculateUserReputation` (dentro de moderate-offer) como a `increment-approved`/`increment-rejected` por separado. Si ambos afectan los mismos campos, el score se duplica.

**Medio — Sin techo ni piso visible para el usuario:**
- El usuario ve su "Nivel 2" y su barra de progreso, pero no sabe qué acciones le dieron puntos ni cuánto le falta para el siguiente nivel. Es una caja negra.

**Bajo — Error handling en increment APIs:**
- Devuelven 200 incluso si el RPC falla. El cliente no tiene forma de saber si la reputación se actualizó o no.

### Mejoras nivel producción
- Eliminar el doble conteo (o documentar que son complementarios, no duplicados).
- En el perfil o en configuración: mostrar un desglose simple ("Ofertas aprobadas: X, Comentarios aprobados: Y, Likes recibidos: Z"). No tiene que ser complejo; solo transparencia.
- En las APIs de reputación: devolver error explícito si falla.

---

## 5. Sistema de eventos y métricas

### Lo que está bien
- Tres tipos de evento claros: view, outbound, share. CTR = outbound/views.
- Deduplicación de vistas en el OfferCard con sessionStorage (un view por oferta por pestaña).
- Deduplicación de outbound en OfferModal con ref (un outbound por apertura de modal).
- Métricas de producto útiles: usuarios nuevos hoy, activos 24h, retención 48h, mejor hora.

### Fallos detectados

**Alto — Doble conteo de vistas:**
- El OfferCard registra un `view` vía `track-view` al hacer scroll (IntersectionObserver).
- Al abrir el modal, se registra otro `view` vía `/api/events`.
- Resultado: una oferta que se ve en el feed Y se abre en modal cuenta 2 vistas.
- Esto infla las vistas y reduce el CTR artificialmente.

**Medio — 0 clics a tienda en métricas (explicación):**
- "Cazar oferta" en el modal llama a `track-outbound` (que registra `outbound`).
- Pero en las métricas, "Clics a tienda" = outbound. Si los usuarios solo dieron al botón "Cazar" (que es el botón de voto en la card), no al link de la tienda, los 0 clics son coherentes.
- Sin embargo, en el modal "Cazar oferta" SÍ llama a `track-outbound`. Si los usuarios en los videos hicieron clic en "Cazar oferta" dentro del modal y aún así hay 0 clics, puede ser que el registro falló (ej. sin token, rate limit, o la variable de entorno no estaba configurada).

**Bajo — Zona horaria del cron:**
- El digest diario se envía a las 00:00 UTC (18:00 hora México). Esto es "salida del trabajo" pero no es configurable.
- El digest semanal dice "domingos" en la UI pero el cron corre los lunes a las 00:00 UTC (domingo 18:00 MX). Técnicamente correcto para MX pero confuso en el texto.

**Bajo — Métricas stale con vista materializada:**
- Para el periodo "all", las métricas vienen de `offer_performance_metrics` (materializada). Si no se refresca con el botón, los datos pueden estar desactualizados.

### Mejoras nivel producción
- Elegir una sola fuente de vistas: o el IntersectionObserver de la card, o el view del modal. No ambos. Lo más preciso: contar el view solo al abrir el modal (intención clara del usuario).
- Añadir columna "Cazadas" (votos) en la tabla de métricas de admin para ver cuántos votos tiene cada oferta, además de views y outbound.
- Documentar la zona horaria en la UI ("Hora de envío: ~18:00 hora México").

---

## 6. Sistema de notificaciones

### Lo que está bien
- Agrupación de likes ("X, Y y N más dieron like a tu oferta"): limpio, no satura.
- Polling cada 60s: equilibrio entre actualidad y carga en el servidor.
- Badge con conteo de no leídas (capped 99+).
- Notificación al aprobar/rechazar/expirar oferta y al recibir reporte (confirmación).

### Fallos detectados

**Alto — No se notifica al dueño cuando alguien comenta en su oferta:**
- Si alguien comenta en tu oferta, no te enteras a menos que vuelvas a abrirla. En una comunidad, esto es un punto de retención crítico: los comentarios generan conversación y vuelta.

**Medio — Tab "Comunidades" siempre vacío:**
- El tab "Comunidades" muestra "Sin actividad en comunidades". Si no hay funcionalidad detrás, es mejor quitarlo para no generar expectativa muerta.

**Bajo — Optimismo en mark-read:**
- Si PATCH falla, unreadCount puede desviarse del real. No se refresca el conteo tras error.

### Mejoras nivel producción
- Notificar al dueño de la oferta cuando reciba un comentario (tipo `offer_comment`, agrupable como los likes).
- Quitar el tab "Comunidades" hasta que haya funcionalidad, o dejarlo deshabilitado con un texto tipo "Próximamente".
- Considerar notificación push (web push via PWA) para retención: "Alguien comentó en tu oferta".

---

## 7. Sistema de autenticación

### Lo que está bien
- Login con Google y con email/contraseña. PKCE habilitado (seguro para SPA).
- Flujo de verificación de correo con modal "Revisa tu correo".
- Reset de contraseña funcional vía Supabase.
- sync-profile crea y actualiza perfil y slug al login.

### Fallos detectados

**Alto — sync-profile sobrescribe el display_name del usuario:**
- Cada vez que hay un cambio de auth (login, refresh), sync-profile se ejecuta y sobrescribe `display_name` con lo que tiene `user_metadata`.
- Si el usuario cambió su nombre en Configuración (ej. de "Juan Pérez" a "JPérez"), al siguiente login vuelve a "Juan Pérez".
- La regla de "solo puedes cambiarlo cada 14 días" se anula de facto.

**Alto — Slug inconsistente:**
- Settings no actualiza el slug al cambiar display_name. sync-profile sí.
- `slugFromUsername()` en el frontend genera un slug por su cuenta (lowercase, trim, replace spaces).
- `toSlug()` en sync-profile hace lo mismo pero puede dar resultado distinto si hay caracteres especiales.
- Resultado: los links "Cazado por X" pueden apuntar a un slug que no coincide con el slug en BD, y el perfil público da 404.

**Medio — No hay manejo de colisión de slugs:**
- Si dos usuarios se llaman "Juan Pérez", ambos tendrían slug "juan-perez". El UNIQUE en `profiles.slug` haría fallar el segundo INSERT/UPDATE.
- No hay lógica de sufijo (ej. "juan-perez-2").

**Bajo — Acentos eliminados en slugs:**
- `toSlug("José García")` → `"jos-garca"` (quita acentos y caracteres no ASCII). Para usuarios hispanos, esto produce slugs difíciles de recordar.

### Mejoras nivel producción
- sync-profile no debe sobrescribir display_name si el usuario lo cambió manualmente. Comprobar `display_name_updated_at`: si existe, no tocar display_name. Solo escribir si es perfil nuevo o si el campo está vacío.
- Settings debe actualizar el slug cuando el usuario cambia display_name.
- Manejo de colisión de slugs: si el slug ya existe, añadir sufijo numérico.
- Para acentos: normalizar con `normalize('NFD').replace(/[\u0300-\u036f]/g, '')` antes de `toLowerCase()`.

---

## 8. Sistema de configuración de usuario

### Lo que está bien
- Secciones claras: Perfil, Correos, Contraseña, Instalar app.
- Cambio de nombre limitado a cada 14 días: evita abuso.
- Preferencias de email con toggle: resumen diario y semanal.
- Sección de PWA con detección de iOS y prompt nativo.

### Fallos detectados

**Alto — No hay opción de subir avatar para usuarios de email:**
- Si el usuario entró por email (no Google), no tiene foto. No hay flujo en configuración para subir una.
- En la comunidad, un usuario sin foto se ve incompleto (icono genérico). Esto reduce confianza en sus ofertas y comentarios.

**Medio — Estructura plana:**
- Todo está en una sola columna sin agrupación clara. "Correos" y "Contraseña" son conceptualmente distintos pero se ven igual visualmente.
- No hay sección "Seguridad" explícita. Falta la opción de cambio de correo.

**Medio — No se actualiza el slug al cambiar nombre (ya mencionado).**

**Bajo — Optimismo en email prefs:**
- Al hacer toggle, el estado se actualiza antes de que el PATCH responda. Si falla, el toggle se queda en la posición incorrecta.

### Mejoras nivel producción
- Reestructurar en: **General** (nombre, avatar), **Seguridad** (contraseña, cambio de correo), **Notificaciones** (digest), **App** (instalar).
- Añadir subida de avatar (Supabase Storage, mismo flujo que imagen de oferta).
- Cambio seguro de correo (confirmar en correo antiguo y nuevo).
- Que el toggle de email revierte si falla el PATCH.

---

## 9. Sistema de comentarios

### Lo que está bien
- Dos niveles: comentarios raíz y respuestas. Suficiente para una comunidad sin complicar.
- Likes en comentarios con toggle.
- Auto-aprobación por nivel de reputación (nivel ≥ 2): reduce moderación sin perder calidad.
- Limite de 280 caracteres: fuerza comentarios concisos (estilo Twitter/X).

### Fallos detectados

**Alto — No se notifica al dueño de la oferta (ya mencionado):**
- Si alguien comenta en tu oferta, no recibes notificación. Perdida directa de retención.

**Medio — Nombre del autor no es link al perfil público:**
- En comentarios y respuestas, el nombre del autor es texto plano. No puedes ir a su perfil para ver qué ofertas ha subido o su reputación.

**Medio — Likes y comments comparten rate limit (20/min):**
- Un usuario que da like a muchos comentarios consume el mismo límite que alguien que comenta. Debería haber presets separados.

**Bajo — parent_id no se valida contra comentarios existentes:**
- Se valida como UUID pero no se verifica que el comentario padre exista. Una respuesta a un ID inexistente se crea sin error pero no se muestra (porque el padre no existe en el fetch).

### Mejoras nivel producción
- Notificar al dueño de la oferta al recibir comentario.
- Hacer el nombre del autor clickeable (link a `/u/[slug]`).
- Separar rate limits para likes de comentarios y creación de comentarios.
- Validar que parent_id exista antes de crear la respuesta.

---

## 10. Sistema de favoritos

### Lo que está bien
- Simple y directo: guardar/quitar. Toggle optimista.
- Página dedicada `/me/favorites` con las ofertas guardadas.
- Se integra con batchUserData para cargar estado junto con votos.

### Fallos detectados

**Bajo — Sin rate limit:**
- No hay rate limit en favoritos. Un bot podría hacer miles de inserts/deletes por minuto.

**Bajo — Fórmula del score en favoritos (ya mencionado):**
- `app/me/favorites/page.tsx` usa `score = up - down` en vez de `up * 2 - down`.

### Mejoras nivel producción
- Añadir rate limit (mismo que default: 30/min es suficiente).
- Corregir fórmula del score para consistencia.

---

## 11. Sistema de guía / onboarding

### Lo que está bien
- Flujo claro: Logo → Bienvenida → Qué es AVENTA → Cómo funciona → Auth. Progresivo.
- Auto-avance en el logo (~1.1s). No obliga a interactuar.
- Animaciones suaves (framer-motion). Se siente moderno.
- Se muestra una vez (localStorage para guests, onboarding_completed para registrados).

### Fallos detectados

**Medio — Guía muy simple para resolver la confusión detectada:**
- GUIDE_STEPS solo tiene 3 pasos (Subir oferta, Votar, Guardar). No explica qué es "Cazar", qué diferencia tiene con "Ir a la tienda", ni que no es obligatorio subir ofertas.
- La auditoría de beta encontró confusión sobre si es un videojuego, un marketplace o una comunidad de ofertas. La guía no resuelve eso.

**Bajo — Doble onboarding posible:**
- `openGuide()` después de sign up puede mostrar el onboarding completo de nuevo. El flag `suppressOnboardingOnce` existe pero su efecto no está claro en todos los caminos.

**Bajo — OAuth timing:**
- Tras login con Google, el usuario regresa con sesión. Si el onboarding ya se cerró antes del redirect, puede no mostrarse.

### Mejoras nivel producción
- Ampliar la guía con más contexto: "AVENTA es una comunidad para encontrar y compartir las mejores ofertas de tiendas. No es obligatorio subir ofertas; tu participación votando ayuda a que todos encuentren los mejores precios."
- Añadir un paso que explique "Cazar = votar para validar la oferta" y "Ir a la tienda = ir al sitio a comprar".
- Más visual: ilustraciones o capturas de la propia app en vez de solo iconos + texto.

---

## 12. App instalable (PWA)

### Lo que está bien
- Detección de prompt nativo `beforeinstallprompt`.
- Instrucciones específicas para iOS ("Menú compartir → Añadir a pantalla de inicio").
- Sección solo visible en móvil.

### Fallos detectados

**Medio — No se puede verificar alineación desde código:**
- No hay evidencia de `manifest.json` actualizado ni de service worker en el repo explorado. Si la PWA se instaló con rutas o configuraciones antiguas, la experiencia puede estar rota o desactualizada.

**Bajo — Solo en configuración:**
- El prompt de instalar app está escondido en Configuración. El usuario casual no llega ahí. Las mejores PWAs muestran el prompt contextualmente (ej. después de N visitas o tras primera interacción significativa).

### Mejoras nivel producción
- Verificar que manifest.json tenga nombre, iconos, start_url y theme_color actualizados.
- Considerar mostrar un banner ligero de "Instalar la app" después de la tercera visita o del primer voto, no solo en configuración.

---

## 13. Sistema admin

### Lo que está bien
- Roles separados: admin, moderator. Permisos granulares por sección (equipo, métricas, moderación).
- Dashboard de salud (health) con datos diarios.
- Logs de moderación.
- Baneos con razón y expiración opcional.

### Fallos detectados

**Medio — Métricas no muestran votos ("Cazadas"):**
- La tabla de actividad de ofertas muestra Vistas, Clics a tienda, CTR y Shares. No muestra votos. Si la acción principal de los usuarios es votar (no ir a la tienda), las métricas no reflejan el comportamiento real.

**Bajo — Zona horaria del "mejor hora":**
- `(utc - 6 + 24) % 24` no maneja horario de verano. En DST, la hora se desvía una hora.

### Mejoras nivel producción
- Añadir columna "Cazadas" (upvotes) en la tabla de métricas.
- Usar timezone-aware (`America/Mexico_City`) en vez de offset fijo.

---

## Resumen ejecutivo: estado de producción

### Lo que está bien (nivel Apple)
- Arquitectura de votos con optimistic UI + trigger + realtime. Bien pensada.
- Feed con ranking_blend (popularidad + reputación del creador). Diferenciador vs competencia.
- Auto-aprobación por reputación. Escala sin necesitar más mods.
- Agrupación de notificaciones de likes. Limpio.
- Rate limiting con Upstash. Protección contra abuso.
- Digest por correo con personalización (Tu oferta en el Top 10). Buen toque.

### Lo que necesita arreglo inmediato (bloquea calidad de producción)
1. **Fórmula del score** en /me, /me/favorites y perfil público: debe ser `up*2 - down` en todos lados.
2. **sync-profile sobrescribe display_name**: anula cambios del usuario.
3. **CHECK de offer_votes.value** ya corregido (era la causa raíz de "votos no se guardan").
4. **"Para ti" no es personalizado**: quitar o renombrar hasta que se implemente.
5. **Link directo a ofertas sin filtro de status**: puede mostrar ofertas vetadas.
6. **Doble conteo de reputación**: verificar y eliminar la duplicación.

### Lo que mejora el producto significativamente (prioridad media)
7. Notificar al dueño cuando alguien comenta en su oferta.
8. Estado de ofertas visible en /me (Pendiente, Aprobada, Rechazada, Expirada).
9. Avatar para usuarios de email en configuración.
10. Nombre de autor en comentarios como link a perfil público.
11. Reestructura de configuración (General / Seguridad / Notificaciones).
12. Slug consistente: no sobrescribir en sync, actualizar en settings, manejar colisiones.
13. Doble conteo de vistas (card + modal).

### Lo que pule el producto (prioridad baja pero suma)
14. Guía más completa y visual (qué es Cazar, por qué votar).
15. Columna "Cazadas" en métricas de admin.
16. Verificar Realtime habilitado para `offers` en Supabase Dashboard.
17. Verificar PWA/manifest alineado con la web actual.
18. Verificar vistas con SECURITY DEFINER en Supabase.
19. Separar rate limits para likes de comentarios vs creación de comentarios.
