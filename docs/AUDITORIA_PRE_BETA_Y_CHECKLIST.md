# Auditoría pre-beta y checklist — AVENTA

Documento para responder a la auditoría sugerida por ChatGPT y definir si el proyecto está listo para **beta privada**. Incluye opinión sobre las conversaciones y una checklist técnica basada en el código actual.

---

## 1. Opinión sobre las conversaciones con ChatGPT

**Auditoría pre-beta (checklist 1–5):**  
Muy alineada con lo que importa: auth, ofertas, correos, rendimiento y UX. Las preguntas son las correctas. La idea de “no confundir 0.8 con 1.0” y “hasta que los datos hablen” es sana.

**Para quién es Aventa / captación:**  
Útil para posicionamiento (cazador inteligente vs creador de ingresos) y para ordenar fases (comunidad semilla → grupos externos → micro líderes → paid). No hay que implementar todo eso en código antes de la beta; sí tener claro el mensaje y la métrica norte.

**Mentalidad “constructor” (distribución, loops, métrica norte):**  
Coincide con lo que ya tienes en producto: reputación, ranking, correos, notificaciones. El punto fuerte es: **definir una métrica norte** antes de lanzar (ej. % que vuelve en 48h, ofertas por usuario, apertura de correo).

**Resumen:** Las preguntas de ChatGPT se pueden responder con el proyecto actual. Abajo está la checklist técnica y qué falta verificar.

---

## 2. Checklist técnica (basada en el código)

### 2.1 Autenticación

| Ítem | Estado | Notas |
|------|--------|--------|
| Login Google (usuario nuevo) | ✅ | AuthProvider + Supabase; sync-profile crea perfil y slug. |
| Login Google (usuario existente) | ✅ | Mismo flujo; sync actualiza display_name, avatar, slug. |
| Incógnito | ⚠️ Verificar | Mismo código; probar en ventana incógnito. |
| Logout limpia sesión | ✅ | `signOut` de Supabase. |
| Refresh no rompe sesión | ✅ | Supabase persiste sesión; AuthProvider mantiene estado. |
| Métricas del usuario se guardan | ✅ | `profiles`: reputation_level, reputation_score; recalculate en aprobar/rechazar oferta, comentarios, likes. |
| RLS no permite acceso cruzado | ⚠️ Verificar en Supabase | notifications, user_email_preferences, profiles con RLS por user_id; ofertas/ votos según políticas del proyecto. Revisar en Dashboard. |
| Rutas protegidas sin sesión | ✅ | /me, /settings, /me/favorites hacen `router.replace('/')` si no hay user. Admin exige rol. No hay middleware global; protección por página. |

**Recomendación:** Probar login/logout/refresh en incógnito y revisar políticas RLS de `offers`, `offer_votes`, `profiles` en Supabase.

---

### 2.2 Subir oferta

| Ítem | Estado | Notas |
|------|--------|--------|
| Validaciones | ✅ | POST /api/offers: título y tienda obligatorios, precio válido, rate limit, usuario autenticado, baneos. |
| Imagen sube sin romper | ⚠️ Verificar | Subida a Supabase Storage o URL; probar con imagen real. |
| No enviar formularios vacíos | ✅ | Validación en API; front puede deshabilitar botón si falta título/tienda. |
| Sistema de votos al instante | ✅ | POST /api/votes; Supabase trigger actualiza oferta; useOffersRealtime escucha UPDATE en `offers` y actualiza UI. |
| Refleja en Destacadas / Nuevas / Top | ✅ | Home usa ofertas por ranking/tiempo; filtros por vista. Realtime actualiza conteos. |

**Recomendación:** Probar subida con una imagen real y confirmar que los votos se ven al momento en todas las pestañas (Destacadas, Nuevas, Top).

---

### 2.3 Correos

| Ítem | Estado | Notas |
|------|--------|--------|
| Se envían sin delay raro | ✅ | Cron diario/semanal; Resend; Vercel Cron o URL con secret. |
| CTA lleva donde quieres | ✅ | Enlaces a `/?o=id` y a la web; botón “Ver todas las ofertas”. |
| No se van a spam | ⚠️ Verificar | Dominio verificado (SPF/DKIM); probar en Gmail/Outlook. |
| Estilos en Gmail | ⚠️ Verificar | Plantilla inline en lib/email/templates; probar en Gmail. |
| Usuario puede desuscribirse | ✅ | Configuración → Correos: desactivar resumen diario/semanal (PATCH preferences). |

**Recomendación:** Enviar un digest de prueba a Gmail/Outlook y revisar bandeja principal vs spam y cómo se ve el HTML.

---

### 2.4 Rendimiento

| Ítem | Estado | Notas |
|------|--------|--------|
| 20 cuentas / varios subiendo a la vez | ⚠️ Probar | Rate limit en ofertas y votos; Supabase y Vercel aguantan carga moderada. |
| Logs Vercel / Supabase | ⚠️ Revisar | Revisar errores y latencia en ambos dashboards. |
| Tiempo de carga en celular | ⚠️ Medir | Objetivo &lt; 3s en algo clave; medir con Lighthouse o similar. |

**Recomendación:** Hacer una prueba con 10–20 usuarios reales (subir ofertas, votar) y revisar logs y tiempos de carga.

---

### 2.5 UX y copy

| Ítem | Estado | Notas |
|------|--------|--------|
| “¿Entiende qué es Aventa en 30s?” | ⚠️ Validar con usuarios | Onboarding (logo, bienvenida, cómo funciona, auth) y home; copy en /descubre. Probar con alguien ajeno al proyecto. |
| Ofertas semilla de calidad | ✅ Decisión tuya | No es código; subir ofertas reales bien redactadas para marcar estándar. |

---

### 2.6 Datos de usuarios con Google

| Ítem | Estado | Notas |
|------|--------|--------|
| Perfil creado/actualizado | ✅ | sync-profile: display_name, avatar_url, slug desde user_metadata/email. |
| Email disponible | ✅ | user.email (Google); se guarda en user_email_preferences para digest. |
| Reputación | ✅ | profiles.reputation_level, reputation_score; recalculate en ofertas y comentarios. |
| Pueden votar | ✅ | /api/votes con token; oferta se actualiza vía trigger; realtime en UI. |
| Todo se actualiza | ✅ | Realtime en ofertas; preferencias y notificaciones por usuario. |

---

## 3. Respuesta directa a “¿Podemos lanzar la beta privada?”

**Sí, con condiciones.**

- **Listo en código:** Auth (Google, logout, refresh), perfil y slug, ofertas (validación, votos, realtime), reputación, correos (Resend, plantillas, preferencias, cron), notificaciones y avisos, preferencias por usuario, admin (equipo, avisos, reputación de mods).
- **Verificar antes de abrir:**  
  1) Login en incógnito.  
  2) RLS en Supabase (no acceso cruzado entre usuarios).  
  3) Envío y visualización de correos (spam, Gmail).  
  4) Subida de imagen real y votos en tiempo real en todas las vistas.  
  5) Una prueba de carga ligera (varios usuarios a la vez) y revisión de logs.

**Recomendación:** Lanzar beta privada con 20–50 personas, con el marco “estamos probando algo nuevo, ayúdennos a romperlo”, y **definir una métrica norte** (ej. “% que vuelve en 48h” o “ofertas subidas por usuario activo”) antes de dar el primer acceso.

---

## 4. Métrica norte (sugerencia)

Elegir **una** para la beta y medirla desde el día 1:

- **% de usuarios que regresan en 48h** (retención temprana).
- **Ofertas subidas por usuario activo** (participación).
- **CTR o apertura del correo diario/semanal** (engagement con el producto).

Sin métrica definida, es fácil sentir que “todo va más o menos”; con una, se puede decidir si la beta fue éxito y qué iterar.

---

## 5. Resumen ejecutivo

| Área | ¿Listo? | Acción |
|------|--------|--------|
| Autenticación | Sí | Probar incógnito y revisar RLS. |
| Ofertas y votos | Sí | Probar imagen real y realtime en todas las vistas. |
| Correos | Sí | Probar entregabilidad y estilos en Gmail. |
| Rendimiento | Por probar | Prueba con 10–20 usuarios y logs. |
| UX/copy | Por validar | Que alguien ajeno entienda en 30s y dar estándar con ofertas semilla. |

**Conclusión:** El proyecto está en buen estado para una **beta privada** siempre que se hagan las verificaciones anteriores y se defina una métrica norte. Las preguntas de ChatGPT son respondibles con el estado actual del producto; lo que falta es validación en uso real y métricas, no tanto código nuevo para el lanzamiento inicial.
