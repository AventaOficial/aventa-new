# Guía AVENTA — Estado, línea del tiempo y checklist

**Documento unificado y roadmap:** este es el único documento de referencia para el día a día. Aquí está el estado del proyecto, lo listo y lo pendiente. La documentación detallada por tema (auditorías, avisos, checklist técnico, comparativas, métricas, etc.) está archivada en `archived/docs/`; para seguir trabajando basta esta guía.

---

## 1. Qué es AVENTA y stack

- **Producto:** Comunidad de ofertas (México). Usuarios suben ofertas, votan, comentan, guardan favoritos. Moderación humana; ranking por votos y tiempo.
- **Stack:** Next.js 16, React 19, Supabase (Auth + DB + Storage), Upstash Redis (rate limit), Vercel. Auth solo Google OAuth.

---

## 2. Línea del tiempo (resumida)

| Fase | Qué pasó |
|------|----------|
| **Pre-auditoría** | Base: auth, ofertas, votos, feed, perfil, comentarios, moderación básica, correos (Resend), reputación. |
| **Auditoría técnica** | Revisión DB, índices, sistema de votos. Score = up×2 − down. Realtime de ofertas. Checklist pre-beta (`AUDITORIA_PRE_BETA_Y_CHECKLIST.md`). |
| **Pre-beta** | Reportes (OfferModal + `/admin/reports`), baneos, vista completa en moderación (descripción, pasos, URL), notificaciones con nombre del mod, líderes (leader_badge, ml_tracking_tag, URLs ML), correos personalizados (Top 10, Top 3 cazadores), métricas de producto (retención 48h, activos 24h, mejor hora). Métrica norte: **retención 48h**. |
| **Beta privada** | Lanzamiento con ~20 personas. Invitaciones en oleadas, feedback, encuestas. |
| **Hoy** | Beta en curso. Métricas en Admin (nuevos hoy, activos 24h, retención 48h, tiempo est. dentro retornados, mejor hora; actividad ofertas). Ofertas de testers (owner activa en moderación → 15 ofertas de ejemplo en home, no afectan métricas). Configuración global `app_config` (show_tester_offers). Docs unificados en esta guía. |

---

## 3. Checklist único (listo / pendiente)

### Listo

- **Auth:** Google, logout, refresh, perfil y slug, sync-profile.
- **Ofertas:** Subir (validación, precios 2 decimales, imagen), feed (filtros, búsqueda, paginación), ranking (score up×2−down), realtime.
- **Oferta extendida:** Modal (descripción, pasos, condiciones), CAZAR OFERTA (track outbound), compartir, reportar.
- **Votos y favoritos:** API votos, favoritos en /me/favoritos.
- **Comentarios:** En oferta, respuestas, likes, solo aprobados visibles.
- **Perfil:** Público /u/[username], /me (mis ofertas), /settings (nombre 14 días).
- **Moderación:** Pendientes/aprobadas/rechazadas/comentarios/baneos; reportes con listado y panel; vista completa oferta; roles (owner, admin, moderator, analyst). Ofertas de testers (toggle solo owner).
- **Admin:** Métricas (comunidad + actividad ofertas + retención 48h + tiempo est. dentro), equipo, avisos, health, reports; **Logs** (moderation_logs, últimos 200) y **Usuarios** (listado con roles, baneos, última actividad) con datos reales.
- **Correos:** Resend, digest diario/semanal, preferencias, cron.
- **Legal:** /privacy, /terms (falta solo correo de contacto real en Privacidad).
- **Seguridad:** Rate limit (Upstash), RLS Supabase, user_id/created_by desde servidor.

### Pendiente antes de lanzar abierto

- [ ] **Privacidad:** Sustituir placeholder del correo de contacto por correo real. En `/privacy` suele haber un email tipo “contacto@ejemplo.com”; reemplazarlo por el correo real de contacto (legal/compliance).
- [x] **Vercel/Supabase/Google:** Producción verificada. Variables en Vercel (Supabase, Resend, Upstash, CRON_SECRET); OAuth 2.0 en Google Cloud con redirect de producción; el usuario ya puede iniciar sesión con Google en prod.
- [ ] **Prueba punta a punta:** Recorrido manual (o E2E): registrarse → subir oferta → votar → comentar → reportar → (como mod) aprobar/rechazar. Objetivo: asegurar que nada está roto antes de abrir a más usuarios.

### Placeholders (no bloquean)

- /communities: placeholder; se deja para más adelante.

---

## 4. Dónde estamos ahora

- **Fase:** Beta privada en curso. La pregunta fuerte es comportamiento: ¿vuelven? ¿suben ofertas? ¿votan?
- **Métricas disponibles:** Usuarios nuevos hoy, activos 24h, retención 48h (métrica norte), tiempo est. dentro (retornados), mejor hora (MX), vistas/clics/CTR por oferta.
- **Ofertas de testers:** El owner puede activar en Admin → Moderación el toggle “Ofertas de testers”; el home muestra entonces 15 ofertas de ejemplo (iPhone, PC gamer, tenis, etc.) que no afectan métricas ni votos/favoritos. Requiere migración `docs/supabase-migrations/app_config.sql` ejecutada en Supabase.

---

## 5. Qué nos dicen las métricas (ejemplo que compartiste)

Con datos tipo: **0 nuevos hoy, 11 activos 24h, 100% retención 48h, mejor hora 18:00 MX, 29 vistas, 0 clics, 0% CTR, 4 ofertas con actividad:**

- **Sí hay señal:** 11 personas abrieron la app en 24h y quienes llevan 48h registrados volvieron (100% es con cohorte pequeño; con más usuarios el % se estabiliza).
- **Mejor hora 18:00:** Útil para enviar correo o contenido cerca de esa hora.
- **0 clics a tienda (CTR 0%):** Nadie ha usado “Ir directo” / “CAZAR OFERTA” en ese período. Puede ser poca oferta atractiva, o que la gente solo mira. Siguiente paso: ver si con más ofertas y más claridad del valor sube el CTR.
- **4 ofertas con actividad:** Hay consumo concentrado en pocas ofertas; buena señal para saber qué tipo de ofertas enganchan.

En resumen: hay uso (vistas, retorno); falta conversión a clic. No es fallo técnico; es producto y contenido.

---

## 6. Valoración del proyecto (en %)

Criterio: “qué tan lejos estamos de algo bien” en sistemas, estructura, diseño y proyecto global. Escala 0–100.

| Área | % | Comentario breve |
|------|---|------------------|
| **Sistemas / infra** | **85** | Auth, DB, RLS, rate limit, cron, correos, realtime y métricas de producto están resueltos. Logs y usuarios en Admin con datos reales. Opcional: mejoras del linter Supabase (RLS auth.uid(), índices duplicados) y más observabilidad. |
| **Estructura / código** | **80** | Next.js App Router, APIs claras, roles y permisos definidos, sin credenciales en repo. Algunos placeholders y docs dispersos (ya unificados aquí). |
| **Diseño / UX** | **75** | Feed, modal, moderación y admin son usables y coherentes. Identidad de marca (“¿es un videojuego?”) y primer impacto se pueden pulir cuando tengas más feedback. |
| **Proyecto global** | **78** | Para beta privada y “algo bien” estás muy cerca: producto funcional, métrica norte definida, legal cubierto salvo correo. Lo que falta es validar con datos reales (retención, CTR, ofertas subidas) y un correo de contacto en Privacidad. |

**En una frase:** Estás alrededor de **80%** de “algo bien” para beta seria y siguiente paso post-beta; el 20% restante es contenido, mensaje, correo legal y lo que digan los datos.

---

## 7. Referencias

- **Contexto Supabase (schema, funciones, triggers):** [SUPABASE_CONTEXTO.md](./SUPABASE_CONTEXTO.md) — en `docs/`.
- **Feedback de encuestas, roadmap resumido y filtros (AVENTA vs Promodescuentos):** [FEEDBACK_Y_ROADMAP.md](./FEEDBACK_Y_ROADMAP.md).
- **Sistemas (app por partes) y notificaciones:** [SISTEMAS_AVENTA.md](./SISTEMAS_AVENTA.md) — mapa actual; propuestas detalladas en archived/docs/SISTEMAS_Y_PROPUESTAS_POST_AUDITORIA.md.

Documentación por tema (beta, checklist técnico, modelo votos, moderación, etc.) está en **`archived/docs/`**: BETA_PRIVADA_COMO_LANZAR.md, PREGUNTAS_BETA_TESTERS.md, ROADMAP_PRODUCTO.md, y el resto. Para el día a día basta esta guía y, si acaso, FEEDBACK_Y_ROADMAP.md.
