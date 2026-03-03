# Continuidad de chat: beta, líderes, auditoría — para seguir en un nuevo chat

Documento de cierre de esta sesión: dudas resueltas, qué está hecho, qué no, y línea del tiempo desde la última auditoría (ChatGPT/Supabase) hasta ahora. Usar esto como contexto al abrir un nuevo chat.

---

## 1. Tus dudas respondidas

### 1.1 ¿Los nombres "Cazador estrella" / "Cazador Aventa" no deberían estar en los niveles como recompensa?

**Hoy hay dos cosas distintas:**

- **Niveles de reputación** (`lib/reputation.ts`): 1 = Nuevo, 2 = Contribuidor, 3 = Cazador Pro, 4 = Elite. Se calculan por puntos (ofertas aprobadas, comentarios, likes). Se muestran en /me, Navbar (Nivel X · Y pts) y ReputationBar.
- **Badge líder** (`profiles.leader_badge`): "cazador_estrella" o "cazador_aventa". Es **manual** en BD: lo asignas tú a quienes son afiliados/ML. Se muestra junto al nombre en OfferCard y OfferModal.

**Tu idea:** usar esos nombres como recompensa de progreso (que el usuario vea el “título” al subir de nivel). Eso se puede hacer de dos maneras:

- **Opción A:** Cambiar los labels de nivel para que coincidan: p. ej. nivel 3 = "Cazador estrella", nivel 4 = "Cazador Aventa" (o "Elite"). Así todo el mundo ve ese nombre al llegar al nivel, sin tocar BD.
- **Opción B:** Dejar los niveles como están (Nuevo, Contribuidor, Cazador Pro, Elite) y que "Cazador estrella" / "Cazador Aventa" sigan siendo solo badges manuales para quienes facturan con ML.

**No implementado aún:** ninguna de las dos. Falta decidir si quieres A (nombres en niveles = recompensa visible para todos) o B (solo badge manual para líderes).

---

### 1.2 Navbar: ¿añadiste un botón nuevo?

**No.** No hay botón nuevo fuera del menú.

**Qué se hizo:** al abrir el **menú de usuario** (clic en tu avatar), la **primera fila** del desplegable es ahora un bloque que hace de enlace a `/me`:

- Arriba: tu nombre (userName).
- Abajo: texto **"Nivel X · Y pts"** (reputationLevel, reputationScore).
- Todo el bloque es un `<Link href="/me">`. Al hacer clic vas a /me y se cierra el menú.

El resto del menú (Guía, Modo claro/oscuro, Moderación si aplica, Configuración, Cerrar sesión) sigue igual debajo. Código: `app/components/Navbar.tsx` líneas ~233–240.

---

### 1.3 Etiqueta ML: ¿solo hay que registrar?

**Sí.** Solo hay que **registrar** en BD la etiqueta (y opcionalmente el badge) por usuario. No hay pantalla en la app para editarlo.

**Qué hace el código (auditoría breve):**

| Dónde | Qué hace |
|-------|----------|
| **BD** | `profiles.leader_badge` ('cazador_estrella' \| 'cazador_aventa' \| null), `profiles.ml_tracking_tag` (texto, ej. 'aventa_capitanjeshua'). Migración: `docs/supabase-migrations/profiles_leader_badge_ml_tag.sql`. |
| **Feed / oferta** | Las queries de ofertas piden `profiles!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag)`. Si la vista `public_profiles_view` tiene columnas fijas, debe incluir esas dos. |
| **lib/offerUrl.ts** | `buildOfferUrl(offerUrl, creatorMlTag)`: si `offerUrl` contiene "mercadolibre" (o ml.) y hay `creatorMlTag`, hace `new URL(offerUrl)`, `parsed.searchParams.set('tag', tag)`, devuelve la URL con `?tag=...` (o `&tag=...` si ya había query). |
| **OfferCard** | Botón "Ir directo": `window.open(buildOfferUrl(offerUrl, author?.creatorMlTag) || offerUrl, '_blank', ...)`. Badge: si `author.leaderBadge === 'cazador_estrella'` o `'cazador_aventa'` muestra el texto + icono. |
| **OfferModal** | Mismo: abrir oferta usa `buildOfferUrl(offerUrl, author?.creatorMlTag)`; badge igual que en la card. |

**Qué tienes que hacer tú:** para cada líder, en Supabase (o con un UPDATE):

- `UPDATE profiles SET ml_tracking_tag = 'aventa_NOMBRE', leader_badge = 'cazador_aventa' WHERE id = 'uuid-del-usuario';`

No hay UI admin para esto todavía; se puede añadir después (p. ej. en Equipo o en una pantalla “Líderes”).

---

## 2. Beta privada: ¿ya se puede lanzar? ¿Sistema y métricas para bugs?

**Resumen:** Con lo que hay hoy (auth, ofertas, votos, correos, moderación, métricas de producto, notificaciones, líderes/badges, onboarding acortado) **sí se puede lanzar una beta privada** siguiendo el doc de “cómo lanzar” y la checklist de auditoría. Lo que falta es operativo: ofertas semilla, invitar en oleadas, recoger respuestas y revisar logs.

**Sistema para detectar problemas:**

- **Métricas de producto** (Admin → Métricas): usuarios nuevos hoy, activos 24h, retención 48h, mejor hora. Sirven para ver si la gente vuelve.
- **Logs:** Vercel (funciones, errores) y Supabase (logs, errores de queries). Revisar tras cada oleada de invitados.
- **Notificaciones:** si algo falla (p. ej. envío de notificación al aprobar oferta), queda registrado en consola/API; no hay panel de “errores de notificaciones” pero los crons y las APIs devuelven error en respuesta.

**Qué recabar en la beta:**

- Respuestas a las **preguntas de beta** (`docs/PREGUNTAS_BETA_TESTERS.md`): qué es Aventa, si se perdieron, si subieron oferta, si entrarían a diario, qué tendría que pasar para usarlo seguido, etc.
- **Métrica norte** que definas: p. ej. % que vuelve en 48h o “al menos 1 oferta subida por N usuarios”.
- Anotar **bugs/fricciones** que reporten o que veas en logs (ej. pantalla en blanco, “no puedo subir oferta”, correo no llega).

**Pasos concretos:** seguir `docs/BETA_PRIVADA_COMO_LANZAR.md`: checklist previo, invitar en 2–3 oleadas (~20 usuarios), canal único para feedback, después enviar cuestionario o llamada corta. No hace falta más código para “lanzar”; lo que queda es subir ofertas, invitar y recoger datos.

### 2.1 Métrica norte y reglas de la beta (consejos ChatGPT, aplicados)

- **Métrica norte elegida:** % **retención 48h** (medible; ya en Admin → Métricas). Otras métricas útiles para contexto (no norte): % que sube ≥1 oferta, % que vota ≥3 veces, tiempo en sesión, CTR por oferta.
- **Umbrales con ~20 usuarios:** 3/20 (15%) = problema; 10/20 (50%) = interesante; 15/20 (75%) = señal fuerte. Dejado en Admin (bloque “Métricas de producto”) y en `BETA_PRIVADA_COMO_LANZAR.md`.
- **Economía:** No anunciarla en beta. Tablas/wallet/comisiones pueden estar listas en interno; no comunicar “se puede ganar dinero” para no cambiar el comportamiento. Primero comportamiento natural, luego incentivos.
- **Líderes:** Incluir **2–3 líderes** de los ~20 (no 10) para observar: ¿suben oferta sin presión?, ¿intentan dominar ranking?, ¿cómo se comportan? Eso da información de riesgo.
- **Performance:** Con 20 usuarios no hay que obsesionarse; revisar logs tras cada oleada basta.

### 2.2 Copy “ofertas nuevas cada día” (sin decir economía)

Para transmitir que hay contenido fresco sin anunciar economía, se añadió:

- **Hero** (home): segunda línea bajo el tagline: “Ofertas nuevas cada día, elegidas por la comunidad.” (móvil y desktop). Constante `FRESHNESS_LINE` en `app/components/Hero.tsx`.
- **Correo diario:** preheader del email: “Nuevas ofertas cada día. Las 10 mejores elegidas por la comunidad.” En `lib/email/templates.ts`.
- **Metadata del sitio:** `app/layout.tsx` description incluye “Ofertas nuevas cada día.” para SEO y redes.

---

## 3. Qué se hizo de tus ideas y qué no

| Idea tuya | Hecho | No hecho / pendiente |
|-----------|--------|----------------------|
| Métrica especial por ofertas (ML) | Doc `METRICAS_LIDERES_Y_MERCADO_LIBRE.md`; sección en Admin → Métricas para pegar datos por etiqueta (tabla + total). | Matching automático oferta ↔ producto ML; API ML. |
| Badge/verificado líder (Cazador estrella / Cazador Aventa) | Columnas `leader_badge` y `ml_tracking_tag`; badges en card y modal; links con `?tag=` para ML. | UI para asignar líder/badge (solo UPDATE en BD). Integrar nombres en niveles como recompensa (ver 1.1). |
| Notificación con nombre del mod al aprobar | "Moderador Pablo aprobó tu oferta" / "CEO X aprobó..."; mensaje opcional para el usuario en la notificación. | — |
| Reforzar retención (correo, “ganas algo”, incentivo beta) | Correo diario: bloque “Tu oferta en Top 10” si aplica. Correo semanal: “Top 3 cazadores de la semana”. Navbar: “Nivel X · Y pts” + link a /me. | “Top 3 cazadores” en home o badge beta (opcional). |
| Moderación: objetivos de calidad + vista mejor | Vista: descripción, pasos, condiciones y URL completa (copiar/abrir) en modal “Ver oferta”. | Objetivos de calidad (metas por categoría/tienda) solo descritos en doc `MODERACION_OBJETIVOS_Y_VISTA.md`. |
| Preguntas para beta testers | Doc `PREGUNTAS_BETA_TESTERS.md` con la lista. | — |
| Cómo lanzar beta (“destrucción controlada”) | Doc `BETA_PRIVADA_COMO_LANZAR.md` (oleadas, mensaje, qué revisar). | — |
| Onboarding: acortar animación page 0 | `PAGE_LOGO_DURATION_MS` de 1800 ms a 1100 ms. | Ajuste fino o mejorar animación (opcional). |
| Alertas por categoría/palabra clave | Idea añadida en `MOTIVOS_DE_REGRESO_Y_RETENCION.md` (§7). | No implementado en producto. |

---

## 4. Línea del tiempo (desde última auditoría hasta este chat)

- **Última auditoría (ChatGPT + Supabase + tú):** Checklist pre-beta en `AUDITORIA_PRE_BETA_Y_CHECKLIST.md`; definición de métrica norte; auth, ofertas, correos, rendimiento; RLS y rutas protegidas.

- **Sesión anterior (resumen que te pasaron):**  
  - Onboarding: reducir duración page 0.  
  - Docs: preguntas beta, cómo lanzar beta, métricas líderes ML, objetivos mods + vista moderación, alertas en retención.  
  - Pendiente: implementar todo lo anterior en código.

- **Esta sesión (este chat):**  
  1. **Onboarding:** `PAGE_LOGO_DURATION_MS` = 1100 ms.  
  2. **Moderación:** Incluir `description`, `steps`, `conditions` en la query de pendientes; mostrarlos en la tarjeta y en el modal “Ver oferta” (descripción, pasos, condiciones, URL completa con Abrir/Copiar).  
  3. **Notificaciones:** Al aprobar oferta, título con nombre del mod (“Moderador X” / “CEO X aprobó tu oferta”), cuerpo con mensaje opcional; API acepta `mod_message`; textarea opcional en la tarjeta de moderación.  
  4. **Líderes:** Migración `profiles_leader_badge_ml_tag.sql` (leader_badge, ml_tracking_tag). `lib/offerUrl.ts` para añadir `tag` a URLs ML. Feed y oferta individual piden leader_badge y ml_tracking_tag del creador. OfferCard y OfferModal: badge “Cazador estrella” / “Cazador Aventa” y uso de `buildOfferUrl` en “Ir directo” / “Ir a la oferta”.  
  5. **Correos:** Diario: bloque personalizado “¡Tu oferta está en el Top 10!” cuando el destinatario tiene oferta en el top 10. Semanal: sección “Top 3 cazadores de la semana” (usuarios con más ofertas entre las 5 mejor votadas).  
  6. **Navbar:** Primera fila del menú de usuario = nombre + “Nivel X · Y pts” con link a /me.  
  7. **Admin → Métricas:** Sección “Métricas líderes (ML)” para pegar datos etiqueta,ganancia y ver tabla + total.  
  8. **Docs:** PREGUNTAS_BETA_TESTERS, BETA_PRIVADA_COMO_LANZAR, METRICAS_LIDERES_Y_MERCADO_LIBRE (§4 muchos líderes), MODERACION_OBJETIVOS_Y_VISTA, MOTIVOS_DE_REGRESO_Y_RETENCION (§7 alertas).  
  9. **Git:** Commit y push con todos los cambios.

- **Última actualización (misma sesión):** Métrica norte fijada en **% retención 48h**; umbrales y nota en Admin → Métricas y en BETA_PRIVADA; copy “Ofertas nuevas cada día” en Hero, email diario y metadata; reglas beta (no economía, 2–3 líderes) en BETA_PRIVADA y §2.1 de este doc.

- **Después de este chat (para el siguiente):**  
  - Decidir si “Cazador estrella” / “Cazador Aventa” entran como nombres de nivel (recompensa por progreso).  
  - Opcional: UI en admin para asignar leader_badge y ml_tracking_tag.  
  - Lanzar beta: subir ofertas semilla, invitar, recoger preguntas y mirar retención 48h.

- **Sesión posterior (Hero, Supabase, PWA):**  
  - Hero: guiño “Ofertas nuevas cada día…” cada 2 min; se implementó animación en **ola letra a letra** (entrada y salida con `hero-wave-in` / `hero-wave-out` y delays por carácter en `Hero.tsx`). En producción/local la animación **sigue viéndose simple** (solo aparece y desaparece); revisar en próximo chat (keyframes, hidratación o que las clases/estilos se apliquen bien).  
  - Consola: **400** en peticiones a `ofertas_ranked_general` con `profiles:public_profiles_view!created_by(display_name,avatar_url,leader_badge,ml_tracking_tag)`. Probable causa: la vista `public_profiles_view` no incluye `leader_badge` y `ml_tracking_tag`, o la relación/nombre no es correcta en Supabase. Revisar definición de la vista y añadir esas columnas si faltan.  
  - PWA: en `/settings` sale “Banner not shown: beforeinstallpromptevent.preventDefault() called…”. Opcional: llamar `prompt()` cuando el usuario pida instalar o no hacer `preventDefault` si no se muestra el banner.

---

## 5. Archivos clave tocados en este chat

- `app/components/OnboardingV1.tsx` — duración page 0.  
- `app/admin/moderation/page.tsx` — select con description, steps, conditions; setStatus con mod_message.  
- `app/admin/components/ModerationOfferCard.tsx` — tipo con description/steps/conditions; modal con descripción, pasos, condiciones, URL copiar/abrir; textarea mensaje opcional al aprobar.  
- `app/api/admin/moderate-offer/route.ts` — notificación con título (mod/CEO + nombre), body con mod_message.  
- `docs/supabase-migrations/profiles_leader_badge_ml_tag.sql` — columnas leader_badge, ml_tracking_tag.  
- `lib/offerUrl.ts` — buildOfferUrl (tag ML).  
- `app/page.tsx` — OfferRow/OfferAuthor con leaderBadge, creatorMlTag; select con leader_badge, ml_tracking_tag; rowToOffer y oferta individual.  
- `app/components/OfferCard.tsx` — author con leaderBadge, creatorMlTag; badge Cazador estrella/Aventa; “Ir directo” con buildOfferUrl.  
- `app/components/OfferModal.tsx` — author.creatorMlTag, buildOfferUrl al abrir; badges.  
- `app/api/cron/daily-digest/route.ts` — created_by en ofertas; por destinatario yourOffersInTop y buildDailyHtml(..., yourOffersInTop).  
- `app/api/cron/weekly-digest/route.ts` — topVoted con created_by; top 3 creadores por cuenta; topHunterProfiles; buildWeeklyHtml(..., topHunters).  
- `lib/email/templates.ts` — buildDailyHtml con yourOffersInTop; buildWeeklyHtml con topHunters.  
- `app/components/Navbar.tsx` — reputationLevel, reputationScore; primera fila del menú = link /me con “Nivel X · Y pts”.  
- `app/admin/metrics/page.tsx` — sección Métricas líderes (ML), textarea + parse + tabla; **bloque Métricas de producto:** nota “Métrica norte beta: Retención 48h” y umbrales (&lt;15% / 50% / ≥75%); label “Retención 48h (métrica norte)”.  
- `app/components/Hero.tsx` — guiño cada 2 min con `FRESHNESS_LINE`; animación en ola letra a letra (keyframes `hero-wave-in` / `hero-wave-out`, `hero-wave-char` con `animationDelay` por índice; estado `isExiting` para salida en ola). En producción la transición no se ve — pendiente revisar.  
- `app/layout.tsx` — metadata description con “Ofertas nuevas cada día.”  
- `lib/email/templates.ts` — preheader correo diario: “Nuevas ofertas cada día. Las 10 mejores elegidas por la comunidad.”  
- Docs: BETA_PRIVADA (métrica norte 48h, umbrales, no economía, 2–3 líderes), PREGUNTAS_BETA, METRICAS_LIDERES, MODERACION_OBJETIVOS_Y_VISTA, MOTIVOS_DE_REGRESO (§7), y este CONTINUIDAD_CHAT_BETA_LIDERES_Y_AUDITORIA.

---

## 6. Pendientes y siguientes fases (consolidado)

Resumen de todo lo que queda repartido en los demás docs, para tener un solo lugar de control y contexto.

### 6.1 Fase actual: para lanzar la beta

| Pendiente | Dónde se menciona | Acción |
|-----------|-------------------|--------|
| Ofertas semilla | BETA_PRIVADA §1, OFERTAS_SEMILLA, AUDITORIA | Subir **15–25 ofertas** de calidad, 5–8 tiendas, 3–4 categorías; opcional 3–5 “ancla” para votar. |
| Checklist técnica | BETA_PRIVADA §1 | Comprobar auth, ofertas, correos, métricas producto. |
| Métrica norte | BETA_PRIVADA §1, AUDITORIA §4 | **Elegida: % retención 48h.** Visible en Admin → Métricas con label “métrica norte”. Umbrales: &lt;15% problema, 50% interesante, ≥75% señal fuerte (con ~20 usuarios). Otras para contexto: % que sube ≥1 oferta, % que vota ≥3. |
| Preguntas beta listas | BETA_PRIVADA §1 | Usar `PREGUNTAS_BETA_TESTERS.md` en cuestionario o llamada. |
| Verificaciones pre-lanzamiento | AUDITORIA §3, §5 | Login incógnito; RLS Supabase; correos (spam/Gmail); subida imagen real y votos realtime; prueba de carga ligera + logs. |
| Ejecutar beta | BETA_PRIVADA | Invitar en 2–3 oleadas (~20 usuarios), **2–3 líderes** de esos 20 para observar; canal único de feedback; no comunicar economía; revisar logs y retención 48h; después enviar preguntas y priorizar arreglos. |

### 6.2 Siguiente fase (producto, post-beta o cuando priorices)

| Pendiente | Dónde se menciona | Acción |
|-----------|-------------------|--------|
| Nombres en niveles | Este doc §1.1, §3 | Decidir Opción A (nivel 3 = “Cazador estrella”, etc.) u Opción B (solo badge manual); si A, cambiar labels en `lib/reputation.ts`. |
| UI admin líderes | Este doc §1.3, §3 | Pantalla (ej. en Equipo o “Líderes”) para asignar `leader_badge` y `ml_tracking_tag` sin UPDATE manual en BD. |
| Objetivos de calidad moderación | MODERACION_OBJETIVOS_Y_VISTA §1 | Bloque “Objetivos del día/semana” en Admin → Moderación: contadores por categoría/tienda y metas (en código, env o tabla `moderation_goals`). |
| Top 3 cazadores en home / badge beta | Este doc §3, MOTIVOS §5 | Opcional: mostrar “Top 3 cazadores” en home o “Badge beta” para primeros usuarios. |
| Alertas por categoría o palabra clave | MOTIVOS_DE_REGRESO §7 | Preferencias de alertas (categoría/keyword) y notificaciones o correo filtrados. |
| themeColor → viewport | Build Next.js | Opcional: mover `themeColor` de `metadata` a `viewport` en layouts/pages que lo usen para quitar warnings. |

### 6.3 Mediano plazo / backlog

| Pendiente | Dónde se menciona | Acción |
|-----------|-------------------|--------|
| Matching oferta ↔ producto ML | METRICAS_LIDERES §2A, §3 | Import/pegado de datos ML por producto + fuzzy match por título para “Posible match ML: X unidades, $Y”. |
| API ML (si existe) | METRICAS_LIDERES §2, recomendación | Sync automático de reportes por etiqueta/producto para “ganancia real ML” por oferta o líder. |
| Menos repetición entre pestañas | OFERTAS_SEMILLA §4 | Opcional: limitar solapamiento (ej. en Recomendado no repetir las mismas N que en Top); no necesario para lanzamiento. |
| Onboarding | Este doc §3 | Opcional: ajuste fino de duración o mejorar animación page 0. |

---

## 7. Problemas abiertos para el siguiente chat

| Problema | Dónde se ve | Acción sugerida / Estado |
|----------|-------------|---------------------------|
| ~~**Animación Hero en ola**~~ | Guiño “Ofertas nuevas cada día…” en home | **Hecho:** keyframes en `globals.css`; longhand para no resetear `animation-delay`; sin `<style>` en Hero. Probar en build. |
| ~~**400 en ofertas_ranked_general**~~ | Consola del navegador (home) | **Hecho:** migración `public_profiles_view_leader_ml.sql` añade `leader_badge` y `ml_tracking_tag` a la vista. Ejecutar en Supabase SQL Editor. |
| **PWA install banner** | Consola en `/settings` | Mensaje “Banner not shown: beforeinstallpromptevent.preventDefault()…”. Si no usas el banner, se puede ignorar; si quieres mostrarlo en móvil, llamar `beforeinstallpromptevent.prompt()` cuando el usuario toque “Instalar app”. |

---

Puedes copiar o referir este doc en un nuevo chat para seguir con: niveles + nombres de recompensa, UI admin de líderes, ejecución de la beta privada, y PWA install banner si aplica.
