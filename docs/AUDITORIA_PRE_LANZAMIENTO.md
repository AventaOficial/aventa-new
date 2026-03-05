# Auditoría pre-lanzamiento — AVENTA

**Fecha:** Pre-public beta  
**Objetivo:** Identificar riesgos, huecos y prioridades para un lanzamiento público mínimo viable.

---

## 1. PRODUCT AUDIT

### 1.1 Flujos confusos y fricción

| Problema | Dónde | Impacto |
|----------|--------|---------|
| **"Qué es AVENTA" no está en la UI** | Home y onboarding | El usuario llega al feed sin una frase clara de valor. El tagline del Hero es "Cada peso ahorrado es un peso ganado", no explica que es una comunidad que cura ofertas. La definición solo existe en metadata (SEO) y en /descubre, al que casi nadie enlaza. |
| **Onboarding: categorías sin auth = no se guardan** | OnboardingV1 → paso 4 | Si el usuario elige 3 categorías y cierra con X sin crear cuenta, las categorías quedan solo en localStorage. Si luego se registra por otro camino, no se sincronizan. Fricción oculta y expectativa rota. |
| **Comunidades en la barra principal** | ActionBar, Navbar | El tab "Comunidades" lleva a una página "Próximamente". Para un usuario nuevo parece una función rota o vacía. Genera ruido y desconfianza. |
| **Reporte: 100 caracteres mínimos sin contexto** | OfferModal → Reportar | El usuario debe escribir ≥100 caracteres. No se explica por qué (anti-spam). Casos obvios ("precio falso", "spam") quedan penalizados por copy largo. |
| **Nombre visible: cambio cada 14 días** | Settings | El límite está explicado en Settings, pero si el usuario no ha entrado antes, el primer rechazo ("Podrás cambiarlo en X días") puede sorprender. |
| **Para ti vacío o poco relevante** | Feed "Para ti" | Si el usuario no ha guardado ni votado nada, el feed personalizado puede ser igual al genérico o vacío. No hay mensaje tipo "Guarda ofertas o vota para personalizar". |

### 1.2 Empty states y feedback

- **Feed sin ofertas (sin búsqueda):** No hay mensaje. Se ve una lista vacía y "Cargar más". Parece error o sitio muerto. **Falta:** "Aún no hay ofertas. Sé el primero en subir una" + CTA a Subir.
- **Comentarios vacíos en modal:** Solo lista vacía. **Falta:** "Nadie ha comentado. ¡Sé el primero!" para invitar a comentar.
- **Búsqueda sin resultados:** Sí hay "No se encontraron resultados". Correcto.
- **Me, favoritos, perfil público:** Tienen copy de empty state. Bien.
- **Errores de red/fetch:** En la mayoría de los casos se hace `.catch(() => setOffers([]))` o similar. **El usuario no ve que algo falló.** Solo ve lista vacía o estado por defecto. No hay toast "No pudimos cargar las ofertas. Revisa tu conexión."

### 1.3 Navegación

- Rutas protegidas bien cubiertas con middleware (redirect a `/` sin sesión).
- Logo/AVENTA en Navbar: hay que confirmar que lleva a `/` (inicio). Si no, en desktop no hay forma obvia de volver al feed desde otras páginas sin usar la ActionBar.
- Notificaciones/avisos con `link: null` pueden usar `#` como fallback; enlaces muertos si no se manejan en el click.

### 1.4 Comunicación "qué es y por qué quedarse"

- **Débil.** La home no tiene un bloque de valor (1–2 frases + beneficio). El Hero es solo título + tagline + búsqueda. Quien aterriza por primera vez no recibe un mensaje claro de "comunidad de ofertas, no vendemos, vosotros subís y votáis".
- **Descubre** (/descubre) sí lo explica, pero no está enlazado desde la home ni desde el onboarding. Solo desde la campana (avisos). Oportunidad perdida para retención y claridad.

### 1.5 Resumen producto

| Área | Valoración | Acción mínima |
|------|------------|----------------|
| Flujos core | Completos | — |
| Empty states | Insuficientes en feed y comentarios | Añadir copy + CTA |
| Feedback de error | Silenciado en cliente | Mostrar toast o mensaje en fallos de carga |
| Onboarding | Categorías sin auth no persisten; valor de AVENTA poco visible | Sincronizar categorías al primer login; 1 pantalla "Qué es AVENTA" o copy en Hero |
| Home / valor | Poco claro en UI | 1 línea de valor en Hero o bloque breve |
| Comunidades | Placeholder en navegación principal | Quitar de la barra o mover a footer como "Próximamente" |

---

## 2. DEALS PLATFORM LOGIC

### 2.1 Implementado y sólido

- **Ranking:** score = up×2 − down, `ranking_momentum`, `ranking_blend` (con peso por reputación), `score_final` con decay temporal. Vistas Día a día, Top, Recientes, Para ti.
- **Expiración:** `expires_at` en DB; filtro en todos los feeds; acción "Marcar como expirada" en moderación; reporte tipo "expirada".
- **Moderación:** Pendiente → Aprobado/Rechazado, comentarios, reportes, bans, roles (owner, admin, moderator, analyst).
- **Spam/abuso:** Rate limits (ofertas 5/min, reportes 10/min, comentarios 20/min, etc.), validación básica, auto-aprobación por reputación, comprobación de ban.
- **Duplicados/similares:** API `/api/offers/similar` (por URL, tienda + título); en moderación se muestran ofertas similares para ayudar al mod. No hay bloqueo al crear.
- **Notificaciones:** Like a oferta → notificación al autor; aprobación/rechazo/expirada; reporte recibido. Digest diario (Top 10) y semanal (Top comentadas + Top votadas). Preferencias en Settings.

### 2.2 Falta o débil

| Elemento | Estado | Riesgo |
|-----------|--------|--------|
| **Hot / Trending** | No hay lógica de "subida reciente de votos" o velocidad. Solo score y decay. | Feed menos adictivo que un Promodescuentos con "🔥 Terminando" o "Trending". |
| **Estado en /me** | En "Mis ofertas" no se muestra Pendiente / Aprobada / Rechazada / Expirada ni motivo de rechazo. | El usuario no sabe por qué no ve su oferta o por qué fue retirada. |
| **Expiración automática** | No hay cron que ponga `expires_at = now` cuando la fecha ya pasó. Solo se expira por acción de mod o reporte. | Ofertas con `expires_at` en el pasado pueden seguir filtrándose bien por el `.gte(now)`, pero el estado en DB queda sucio. |
| **Detección de duplicados al crear** | Solo se ayuda al mod con similares. El usuario puede subir la misma oferta varias veces. | Duplicados en el feed, más trabajo de moderación. |
| **Notificación al autor por comentario** | Solo hay notificación por like a la oferta. No cuando alguien comenta. | Menos engagement y vuelta al producto. |
| **Digest por categorías** | Digest diario/semanal es Top global. No se filtra por preferencias de categorías del usuario. | Menor relevancia del email, más bajas de suscripción. |

### 2.3 Resumen deals

- La base de ranking, moderación, reportes y notificaciones está bien para una beta.
- Los huecos que más afectan al "deals platform" son: **estado claro de "Mis ofertas"** (P0 para confianza) y **evitar duplicados al crear** (P1). Hot/trending y digest personalizado son P2.

---

## 3. CODE QUALITY + ARCHITECTURE

### 3.1 Data fetching y estado

- **Fetch en cliente en casi todo:** page.tsx, settings, me, admin, OfferModal, Navbar, ActionBar. No hay React Query/SWR; no hay capa de caché ni revalidación. Cada visita recarga todo.
- **Errores silenciados:** Patrón `.catch(() => setOffers([]))` o `.catch(() => {})` en page.tsx, settings, OfferModal, admin. El usuario no recibe feedback de fallo.
- **Estado muy repartido:** page.tsx tiene ~18 useState; OfferModal y OnboardingV1 también son muy pesados. UIProvider concentra muchos flags (toast, modales, onboarding) y cualquier cambio re-renderiza a todos los consumidores de `useUI()`.
- **Duplicación:** Reputación se carga en Navbar y en /me por separado. Formulario de auth duplicado en OnboardingV1 (flujo inline + RegisterModal) con los mismos campos y lógica.

### 3.2 Auth en APIs

- **Inconsistencia:** Unas rutas usan `createServerClient()` + `supabase.auth.getUser(token)` (feed/for-you, notifications, sync-profile…) y otras `fetch(\`${url}/auth/v1/user\`, { Authorization: Bearer ... })` (offers, reports, votes, comments, track-view, upload…). Funciona pero duplica lógica y es frágil ante cambios de Supabase.

### 3.3 Supabase y rendimiento

- **Queries:** Uso correcto de `.in()`, `Promise.all` y lotes (batchUserData, feed for-you, admin users/logs). No hay N+1 obvio.
- **Vista `ofertas_ranked_general`:** Orden por `ranking_blend`; si la vista no está materializada o bien indexada, el feed puede volverse lenta con muchas filas.
- **Índices:** No hay migraciones de índices en el repo. Conviene revisar en Supabase índices sobre (status, expires_at, created_at), (offer_id, status) para comentarios, etc.
- **`/api/offers/similar`:** Sin rate limit. Usa `ilike('title', '%...%')`; con mucho contenido puede ser costoso sin índice de texto (p. ej. GIN).

### 3.4 Seguridad

- Rate limiting bien repartido (offers, votes, reports, comments, notifications, feed, etc.). **Falta en** `/api/offers/similar`.
- Validación manual (no Zod); UUIDs con `isValidUuid`. Aceptable para el tamaño actual.
- Admin protegido por `requireModeration` / `requireOwner` / etc. Cron protegido con `CRON_SECRET`.

### 3.5 Mantenibilidad

- **Archivos muy largos:** OnboardingV1.tsx >1000 líneas, OfferModal.tsx ~950, page.tsx ~810, Navbar ~400, ModerationOfferCard ~580. Dificultan cambios y pruebas.
- **Error boundary:** Solo `app/error.tsx` global. No hay error.tsx por ruta (p. ej. admin) para aislar fallos.

### 3.6 Imágenes

- **Solo `<img>`:** No se usa `next/image`. OfferCard, OfferModal, ActionBar, admin (team, reports, ModerationOfferCard) cargan imágenes con `<img>`. No hay redimensionado, formatos modernos ni lazy loading integrado. Riesgo de peso y LCP en móvil.

### 3.7 Resumen código

| Tema | Valoración | Acción prioritaria |
|------|------------|--------------------|
| Fetch / caché | Todo en cliente, sin caché | P2: considerar React Query o SWR en feed/home |
| Errores en UI | Silenciados | P0: mostrar toast o mensaje cuando falle carga de feed/config |
| Estado / duplicación | Reputación y auth form duplicados | P2: unificar obtención de usuario en APIs; opcional contexto de perfil |
| Supabase | Correcto en lotes; vista e índices a revisar | P1: rate limit en similar; P2: índices y vista materializada si hay latencia |
| Imágenes | Sin optimizar | P1: usar next/image en OfferCard/OfferModal al menos |
| Archivos largos | Varios >500 líneas | P2: dividir Onboarding y OfferModal cuando se toquen |

---

## 4. LAUNCH RISKS

### 4.1 Cosas que pueden romper o dañar el producto

| Riesgo | Dónde | Mitigación |
|--------|--------|------------|
| **Feed falla y el usuario ve vacío** | page.tsx: fetch del feed con `.catch(() => setOffers([]))` | Mostrar mensaje "No pudimos cargar. Revisa tu conexión" + reintentar. P0. |
| **App config / stores fallan** | page.tsx: `.catch(() => setShowTesterOffers(false))`, `.catch(() => {})` | No bloquea, pero si app_config no existe o falla, el comportamiento por defecto debe estar documentado y probado. |
| **Ofertas de testers en producción** | show_tester_offers en app_config | Si alguien activa el toggle en prod, 15 ofertas fake aparecen en home. Asegurar que solo owner pueda cambiar esto y que en beta pública esté en false o muy controlado. |
| **Enlaces afiliados** | buildOfferUrl (ML tag), offer_url en ofertas | Si `offer_url` está mal formado o ML cambia parámetros, el enlace puede romperse. try/catch ya devuelve url original; conviene probar con URLs ML reales. |
| **Imágenes grandes** | Todas las imágenes con `<img>` sin optimizar | En móvil, muchas imágenes de ofertas pueden hacer la home lenta y consumir datos. P1: next/image. |
| **Sitemap solo estático** | sitemap.ts: solo 4 URLs (home, descubre, privacy, terms) | No incluye ofertas ni perfiles. Para SEO de ofertas concretas haría falta sitemap dinámico o al menos enlazar /descubre y categorías si existieran. Aceptable para beta. |
| **robots.txt** | Disallow /me, /settings, /admin, /api | Correcto. Sitemap apunta a aventaofertas.com; si el dominio es otro, hay que cambiar. |
| **/me sin estado de ofertas** | Usuario no ve Pendiente/Aprobada/Rechazada/Expirada | No es un "bug" pero sí confusión: "subí una oferta y no aparece". Puede generar soporte y desconfianza. P0 o P1. |
| **Comunidades en la barra** | Link a "Próximamente" | Sensación de producto a medias. P1: quitar de barra principal o dejar solo en footer. |
| **Categorías onboarding sin auth** | localStorage no se sincroniza si cierra sin registrarse | Ya comentado en producto. P1. |
| **Rate limit sin Redis** | Si Upstash no está configurado, rate limit no se aplica | En producción debe estar; si falta, abuse posible. Verificar env en Vercel. |
| **CRON_SECRET** | Digest diario/semanal | Si no está definido o alguien descubre el valor, pueden disparar los cron manualmente. Bajo impacto pero verificar. |

### 4.2 Resumen riesgos

- **Críticos:** Feed que falla en silencio; usuario que no entiende el estado de sus ofertas (pendiente/rechazada/expirada).
- **Importantes:** Imágenes sin optimizar; ofertas de testers mal configuradas; Comunidades como tab principal; categorías no sincronizadas al cerrar onboarding sin auth.
- **Menores:** Sitemap estático, posible coste de /api/offers/similar sin rate limit.

---

## 5. MISSING FEATURES FOR LAUNCH (mínimo para beta pública)

Enfocado en engagement, retención, usabilidad y confianza. Sin features complejos.

1. **Empty state en feed (sin búsqueda)**  
   Mensaje claro + CTA "Subir oferta" cuando no hay ofertas. Evita que parezca error o sitio vacío.

2. **Empty state en comentarios del modal**  
   "Nadie ha comentado. ¡Sé el primero!" para invitar a participar.

3. **Feedback cuando falla la carga del feed (o config)**  
   Toast o mensaje "No pudimos cargar. Revisa tu conexión" en lugar de lista vacía silenciosa.

4. **Estado de "Mis ofertas" en /me**  
   Badge o texto por oferta: Pendiente / Aprobada / Rechazada / Expirada. Opcional: motivo de rechazo. Reduce soporte y mejora confianza.

5. **Una línea de valor en home (o en onboarding)**  
   Frase tipo "Comunidad de cazadores de ofertas. Tú subes, la comunidad vota." en Hero o justo debajo. Mejora claridad y retención.

6. **Comunidades fuera de la barra principal**  
   Quitar el tab "Comunidades" de la ActionBar o moverlo a un menú secundario/footer como "Próximamente". Reduce sensación de producto incompleto.

7. **Sincronizar categorías de onboarding al primer login**  
   Si hay categorías en localStorage de un onboarding previo (usuario cerró sin registrarse), al iniciar sesión por primera vez enviarlas a preferred-categories. Mejora coherencia de la personalización.

Opcional para el mismo periodo:

- Notificación al autor cuando alguien comenta en su oferta (engagement).
- Rate limit en GET `/api/offers/similar` (seguridad y coste).

---

## 6. PRIORITY LIST

### P0 — Must fix before launch

1. **Empty state del feed** cuando no hay ofertas (mensaje + CTA).
2. **Mostrar al usuario cuando falla la carga del feed** (toast o mensaje, no silencio).
3. **Estado de ofertas en /me** (Pendiente / Aprobada / Rechazada / Expirada) para que el usuario entienda por qué no ve su oferta.
4. **Prueba E2E manual** completa: registro → subir oferta → votar → comentar → reportar → moderar (como en GUIA).

### P1 — Should improve soon

5. Empty state en comentarios del modal ("¡Sé el primero!").
6. Una línea de valor en home (qué es AVENTA).
7. Quitar o recolocar "Comunidades" de la barra principal.
8. Sincronizar categorías de onboarding al primer login (si hay en localStorage).
9. Rate limit en `/api/offers/similar`.
10. Usar `next/image` en OfferCard y OfferModal (rendimiento e imágenes).

### P2 — Improvements for later

11. Unificar obtención de usuario en APIs (helper único en lugar de fetch vs getUser).
12. Un solo componente de formulario de auth (Onboarding + RegisterModal).
13. Contexto o fuente única para reputación (Navbar + /me).
14. Notificación al autor por comentario en su oferta.
15. Digest por categorías preferidas.
16. Lógica "hot/trending" o "Terminando pronto".
17. Detección/aviso de ofertas similares al crear (sin bloquear aún).
18. Error boundaries por ruta (p. ej. admin).
19. Dividir OnboardingV1 y OfferModal en componentes más pequeños.

---

## 7. HONEST FEEDBACK

### Lo que suena a amateur

- **Home sin mensaje de valor.** Quien aterriza no sabe en 5 segundos qué es esto. Promodescuentos no lo explica mucho en la portada, pero tiene marca y volumen; vosotros no. Una frase en Hero cambia la primera impresión.
- **Errores que se tragan.** Ver lista vacía cuando en realidad falló el fetch es de producto sin pulir. El usuario piensa "no hay nada" o "está roto" y se va.
- **"Comunidades" en la barra como tab principal** con "Próximamente" dentro es de MVP que no ha decidido qué enseñar. O quitas el tab o lo pones en un sitio secundario.
- **Mis ofertas sin estado.** En cualquier plataforma con moderación, el usuario espera ver "En revisión" o "Rechazada". Si no está, parece que la oferta se perdió o que el producto está a medias.
- **Dos formularios de auth casi iguales** en el mismo archivo (onboarding + modal) es deuda técnica clara. No mata el lanzamiento pero hace más caro cualquier cambio en auth.
- **Imágenes con `<img>`** en una app de ofertas donde el feed es 90% imágenes es una omisión de rendimiento importante para móvil.

### Lo que suena prometedor

- **Stack y flujo core:** Next.js, Supabase, Auth con Google, ofertas → votos → comentarios → moderación → reportes está bien resuelto. No hay que rehacer el producto.
- **Ranking con reputación y decay temporal** está pensado; no es solo "más votos = arriba". Día a día vs Top da variedad.
- **Moderación y roles** (owner, admin, mod, analyst) están claros y cubren el mínimo para escalar un poco el equipo.
- **Rate limiting y bans** están; no estáis desnudos ante el abuso.
- **Digest y notificaciones** (like a oferta, aprobación, rechazo) dan bucles de vuelta al producto. Falta notificación por comentario, pero la base existe.
- **Ofertas de testers** con toggle en app_config es una buena idea para no tener feed vacío en pruebas; solo hay que asegurar que en beta pública esté bien configurado.

### Qué puede hacer que funcione

- **Claridad desde el primer pantallazo:** una frase en Hero + empty state con CTA. La gente tiene que entender "comunidad de ofertas" y ver qué hacer cuando no hay nada.
- **Confianza:** estado de "Mis ofertas" y feedback cuando algo falla. Si el usuario siente que el sistema es transparente y que los fallos se comunican, vuelve.
- **Contenido inicial:** con 15 ofertas de testers o con ofertas reales curadas, el feed no se ve vacío. Sin contenido mínimo, la retención se resiente.
- **No prometer lo que no existe:** quitar Comunidades de la barra o etiquetarla bien evita "esto no funciona".

### Qué puede matar el producto

- **Lanzar con feed que falla en silencio:** primera visita, error de red o de API, el usuario ve vacío y se va. No vuelve.
- **Lanzar con feed realmente vacío** y sin empty state: mismo efecto. "No hay nada aquí."
- **Usuarios que suben ofertas y no saben si están pendientes o rechazadas:** generan soporte y desconfianza. "No me publicaron" sin explicación mata la confianza en la moderación.
- **Complejidad prematura:** más features antes de tener retención y uso real. Mejor cerrar P0 y P1 y lanzar con poco pero estable y claro.

### Conclusión

El producto está **cerca de poder lanzar una beta pública** si se cierran los P0 (empty state feed, feedback de error, estado en /me, E2E) y se evita la sensación de "roto" o "vacío". La base técnica y de negocio (ofertas, votos, moderación, notificaciones) es suficiente para un Promodescuentos mínimo. Lo que falta es **claridad, feedback al usuario y transparencia del estado de sus acciones**. Con eso y un poco de contenido inicial, tenéis base para aprender y iterar.

---

*Documento generado a partir de revisión de código y flujos. Recomendación: usar esta lista como checklist y cerrar P0 antes de abrir la beta pública.*
