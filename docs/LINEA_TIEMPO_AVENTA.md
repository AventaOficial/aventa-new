# AVENTA — Línea del tiempo del proyecto

**Documento maestro de historia, hitos e inversión de tiempo.**  
**Última actualización:** 30 de agosto de 2026  
**Fundador:** Jafet (puramente solo)  
**Estado al cierre de este documento:** Pre-lanzamiento comunitario público (Rewards OFF)

> **Vista interactiva:** abre el [Canvas de línea del tiempo](file:///C:/Users/yanin/.cursor/projects/e-AVENTA-NEW-aventa-new/canvases/linea-tiempo-aventa.canvas.tsx) al lado del chat para gráficas, fases colapsables y tablas.

---

## 1. Resumen ejecutivo


| Concepto                                        | Valor                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| **Primera pregunta (acta fundacional)** | **5 jul 2025, 12:32 a.m.** — ChatGPT: *“¿Cómo se llama cuando alguien compra por un link mío?”* → ver [`ACTA_FUNDACIONAL_AVENTA.md`](./ACTA_FUNDACIONAL_AVENTA.md) |
| **Nacimiento de la idea (personal)** | **6 de julio de 2025** — laptop Victus, inicio del build en el año más difícil |
| **Primer registro técnico**                     | **13 de julio de 2025** — proyecto Supabase `AventaOficial's Project` |
| **Nombre “Aventa” formalizado**                 | ~**septiembre 2025** (`aventa-clean`, logos Fiverr)                   |
| **Reconstrucción repo actual**                  | **3 de febrero de 2026** (`aventa-new`)                               |
| **Supabase producción actual**                  | **6 de febrero de 2026** — `Aventa Cazadores de ofertas`              |
| **Dominio producción**                          | `aventaofertas.com` (Vercel)                                          |
| **Calendario total**                            | **~420 días** (6 jul 2025 → 30 ago 2026) ≈ **1 año y 14 días**        |
| **Días con actividad documentada**              | **54 días**                                                           |
| **Horas medidas (días con evidencia)**          | **~228 horas** (promedio **~4,2 h/día** activo)                       |
| **Trabajo no registrado (estimación opcional)** | **~5 h/día** que tú usas mentalmente cuando no hay log                |
| **Total personal aproximado**                   | **~228 h medidas** + lo que sumes por días sin evidencia              |
| **Commits git (ambos repos)**                   | **261** (29 en `aventa-clean` + 232 en `aventa-new`)                  |
| **Chats Cursor guardados**                      | **27 conversaciones principales**                                     |


> **Nota:** Las **228 h** salen de cruzar git + Cursor + capturas (jul 2025). Los **5 h** no son la media de todo el proyecto — es la referencia que tú das a sesiones **sin registro** (otra cuenta ChatGPT, Bubble a mano, pruebas en prod, etc.).

---

## 1.1 Contexto personal — por qué este documento importa

*Esta sección la pidió Jafet. No es parte del stack ni de los commits; es la historia humana detrás de Aventa.*

**2025 fue un año muy difícil.** Jafet describe que, en los días de 2025 en los que trabajaba en la idea, **no hubo día en que no quisiera quitarse la vida**. Aventa nació en julio de ese mismo año — no como escape perfecto, sino como algo que igual se construyó en medio de la tormenta.


| Fecha                                       | Lo que Jafet recuerda                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Todo 2025** (días con trabajo en la idea) | Pensamientos suicidas presentes cada día                                                                                      |
| **31 dic 2025**                             | Último día del año: le rogó a Dios que le diera **paz**                                                                       |
| **27 may 2025**                             | Intento de suicidio                                                                                                           |
| **Vie 28 ago 2026**                         | Terminó su relación con **Dairia Sánchez** — está en duelo                                                                    |
| **Dom 30 ago 2026, ~2–3 p.m. → 11:31 p.m.** | Sesión larga (~**9 h**): auditorías, línea del tiempo, canvas. Cansado, pero **contento de seguir aquí**, construyendo Aventa |


**Hoy (30 ago 2026):** no sabe del todo por qué hizo este documento — tal vez para ver cuánto ha trabajado, tal vez por otra razón. Lo que sí sabe es que **sigue feliz de estar aquí**, trabajando en Aventa.

> Aventa no borra el dolor ni el duelo. Pero queda registrado que, en paralelo a todo eso, hubo **~228 horas medidas** de construcción, pausas honestas, reconstrucción técnica y una idea que **todavía no suelta**.

Si en algún momento vuelve a sentirse en peligro: en México puedes llamar a la **Línea de la Vida** al **800 911 2000** (24 h, confidencial). No estás solo.

---

## 1.2 Acta fundacional — primer chat ChatGPT (5 jul 2025)

**5 de julio de 2025, 12:32 a.m.** Jafet abre un chat en ChatGPT con una sola pregunta:

> *“¿Cómo se llama cuando alguien sí compra por un link mío yo gano dinero??”*

En esa misma conversación (recuperada el **31 ago 2026** como *“Jafet del futuro”*) la idea escaló en horas:

- Marketing de afiliados → Promodescuentos → **300 publicaciones/día**
- Usuarios que suben ofertas y ganan → **30% plataforma / 70% comunidad**
- **Gremios**, gamificación, Telegram/IG, roadmap de lanzamiento

**Documento completo preservado:** [`docs/ACTA_FUNDACIONAL_AVENTA.md`](./ACTA_FUNDACIONAL_AVENTA.md)

> De *“¿cómo gano con un link?”* a arquitectura de startup en una noche. El nombre **Aventa** llegó después; la **semilla** está en ese chat.

---

## 2. Metodología de estimación de horas

### Horas medidas (días con evidencia)

Por cada día documentado se tomó el **mayor valor razonable** entre:


| Fuente                    | Cómo se calcula                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------- |
| **Git**                   | Commits del día → 2 h (1 commit) · 3 h (2–4) · 4 h (5–9) · 6 h (10–17) · 8 h (18+) |
| **Cursor**                | Ventana entre primera y última actividad en transcripts ese día (tope 14 h)        |
| **Ideación jul–oct 2025** | Capturas + Supabase: jul 5–7 intenso (6–8 h), resto según hito                     |
| **Día con git + Cursor**  | Promio ponderado (~65 % de la suma) para no duplicar                               |


### Trabajo no registrado (referencia personal)

> Cuando trabajaste en Aventa **sin** commit, chat ni captura, tú usas **~5 h** como referencia mental.

Eso **no** está incluido en las 228 h. Si crees que hubo ~15 días así repartidos en el año → **+~75 h** → total personal **~300 h**. Ajusta tú ese número.

**Meses en pausa** (dic 2025, ene 2026, may 2026): 0 h medidas.

---

## 3. La semilla — qué nació el 6 de julio de 2025

La idea central **sigue siendo reconocible hoy**:


| Elemento                 | Jul 2025 (idea)  | Ago 2026 (producto)                                                     |
| ------------------------ | ---------------- | ----------------------------------------------------------------------- |
| Plataforma de ofertas    | ✅                | ✅ Feed, publicar, votar                                                 |
| Comunidad de usuarios    | ✅                | ✅ Beta ~20 personas                                                     |
| Votación comunitaria     | ✅                | ✅ Score up×2−down                                                       |
| Enlaces de afiliados     | ✅                | ✅ Amazon, Mercado Libre                                                 |
| Recompensas a creadores  | ✅                | ✅ Rewards V1 (OFF en prod)                                              |
| Plataforma vende ofertas | ✅ (idea inicial) | ⚠️ Evolucionó → Aventa monetiza vía afiliados propios, no vende directo |


**Frases fundacionales (ChatGPT, jul 2025):**

- *“Tu propio Promodescuentos descentralizado… tu proyecto millonario.”*
- *“Negocio escalable, innovador y con potencial millonario.”*
- Proyección temprana: 5 publicaciones virales/día + afiliados → **$50,000–$160,000 MXN/mes**

---

## 4. Infraestructura e identidad técnica

### 4.1 Supabase


| Proyecto                        | ID                     | Creado          | Región    | Rol en la historia                                                                         |
| ------------------------------- | ---------------------- | --------------- | --------- | ------------------------------------------------------------------------------------------ |
| **AventaOficial's Project**     | `oojshofrpbfwsiypcecr` | **13 jul 2025** | us-west-1 | Prototipo original. Primera oferta en DB: **13 jul 2025**. Primer perfil: **18 jul 2025**. |
| **Aventa Cazadores de ofertas** | `mkgsrpsuvedwwlzmzmzh` | **6 feb 2026**  | us-east-2 | Producción actual. Primer perfil: **7 feb 2026**. Ofertas en prod: **227** (ago 2026).     |


### 4.2 Repositorios git


| Repo           | Ruta                     | Primer commit  | Último commit   | Commits |
| -------------- | ------------------------ | -------------- | --------------- | ------- |
| `aventa-clean` | `Downloads/aventa-clean` | **9 nov 2025** | **12 nov 2025** | 29      |
| `aventa-new`   | `AVENTA NEW/aventa-new`  | **3 feb 2026** | **30 ago 2026** | 232     |


### 4.3 Vercel y dominio


| Hito                                   | Fecha           | Evidencia                                                     |
| -------------------------------------- | --------------- | ------------------------------------------------------------- |
| Primer despliegue Vercel (repo actual) | **26 feb 2026** | Commit *“Preparar despliegue Vercel”*                         |
| Dominio producción                     | —               | `aventaofertas.com` (robots.txt, layout, extensión)           |
| Crons producción                       | ago 2026        | 7 jobs en `vercel.json` (digests, salud, rewards-holds, etc.) |


> **Vercel MCP:** no autenticado al generar este doc — fechas exactas de primer deploy en dashboard Vercel pendientes de verificar manualmente.

### 4.4 Stack por era


| Era                | Stack                                               | Evidencia                                                                 |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
| **Jul–oct 2025**   | Bubble.io + Supabase legacy                         | URL `aventaficial.bubbleapps.io/version-test`, capturas del editor Bubble |
| **Nov 2025**       | Next.js (`aventa-clean`)                            | 29 commits: telemetry, feed virtualizado, suggest, perf                   |
| **Feb 2026 → hoy** | Next.js 16 + React 19 + Supabase + Upstash + Vercel | Repo actual, `GUIA_AVENTA.md`                                             |


### 4.5 Branding


| Fecha    | Evento                                                                          |
| -------- | ------------------------------------------------------------------------------- |
| Jul 2025 | Exploración de logos en Fiverr (magnifying glass, flechas, etiquetas de precio) |
| Jul 2025 | Logo final naranja: tag con “A” + nodos de red                                  |
| Sep 2025 | Nombre **Aventa** en repo `aventa-clean`                                        |


---

## 5. Línea del tiempo cronológica

### 🌱 Fase 0 — Ideación y validación (jul–oct 2025)

**~42 h medidas · 10 días activos**


| Fecha            | Hito                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **5 jul 2025, 12:32 a.m.** | 📜 **Acta fundacional** — primer chat ChatGPT: *“¿Cómo se llama cuando alguien compra por un link mío?”* → [`ACTA_FUNDACIONAL_AVENTA.md`](./ACTA_FUNDACIONAL_AVENTA.md) |
| **6 jul 2025** | 🎂 Laptop HP Victus; inicio del build en el año más difícil. |
| **5–7 jul 2025** | Sesiones intensivas ChatGPT: modelo de negocio, afiliados (Hotmart, ClickBank, Amazon), proyecciones de ingreso, estructura del negocio. **Capturas conservadas.** |
| **13 jul 2025**  | 🗄️ **Supabase `AventaOficial's Project` creado.** Primera oferta registrada el mismo día.                                                                         |
| **18 jul 2025**  | Primer perfil de usuario en Supabase legacy.                                                                                                                       |
| **Jul–ago 2025** | Prototipo en **Bubble.io** (`aventaficial.bubbleapps.io`): hero verde, “Descubre ofertas increíbles”, login, publicar oferta, últimas ofertas.                     |
| **16 ago 2025**  | Primera conversación ChatGPT registrada con la descripción formal de la plataforma (cuenta anterior).                                                              |
| **Sep 2025**     | Nombre **Aventa** + repo `aventa-clean` + logos Fiverr.                                                                                                            |
| **Oct 2025**     | Trabajo con Supabase y estructura Next.js (cuenta ChatGPT anterior).                                                                                               |


**Concepto validado:** Promodescuentos mejorado + incentivos reales + afiliados.

---

### ⚡ Fase 1 — Primer código Next.js (`aventa-clean`) (nov 2025)

**~14 h medidas · 3 días activos**


| Fecha           | Hito                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| **9 nov 2025**  | Snapshot **AVENTA B1.1**: telemetry, feed virtualizado, docs, env.                                             |
| **11 nov 2025** | Performance sprint: next/image LCP, motion-safe, SWR, suggest API, bilingual search. **21 commits en un día.** |
| **12 nov 2025** | LoggedHome premium: hero sticky, For You / Trending, telemetry 204.                                            |


**Intensidad:** burst de 4 días, luego silencio.

---

### ⏸️ PAUSA — (dic 2025 – ene 2026)

**0 días activos documentados · ~2 meses**

Sin commits, sin chats Cursor guardados. Carpeta Cursor del proyecto viejo activa hasta ~feb 2026, pero sin transcripciones.

---

### 🏗️ Fase 2 — Reconstrucción / fundación (feb–mar 2026)

**~78 h medidas · 18 días activos** (feb 16 h + mar 62 h)


| Fecha              | Hito                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| **3 feb 2026**     | 🔄 **Nuevo repo `aventa-new`** — “Initial commit from Create Next App”. Cambio de Aventa viejo → Aventa nuevo.  |
| **6 feb 2026**     | 🗄️ **Nuevo Supabase `Aventa Cazadores de ofertas`** (región us-east-2).                                        |
| **7 feb 2026**     | Primer perfil en Supabase nuevo.                                                                                |
| **26–28 feb 2026** | Despliegue Vercel, OAuth Google, PWA, legal `/privacy` `/terms`, comentarios, baneos. **18 commits el 27 feb.** |
| **2–6 mar 2026**   | Votos, notificaciones, “Qué es AVENTA”, checklist pre-lanzamiento, SEO, rate limit, Hero animado.               |
| **12 mar 2026**    | 📋 **Inicio beta privada documentada en Cursor** (~20 personas, retención 48h).                                 |
| **27 mar 2026**    | Día más intenso del mes: visibilidad, panel comisiones, objetivos moderación. **~11.5 h Cursor + 12 commits.**  |
| **29–31 mar 2026** | UI Descubre, bot ML worker, CI fixes. **110 commits en marzo total.**                                           |


---

### 🧪 Fase 3 — Beta privada (mar–jul 2026)

**~40 h medidas** en abr–jul (sin contar mar, ya en fundación)


| Fecha            | Hito                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| **Mar–abr 2026** | Reportes, moderación completa, bot Mercado Libre ingest, hardening SSRF, gate admin.          |
| **Abr 2026**     | Worker bot, moderación en coluna, caps de ingest.                                             |
| **Jun 2026**     | Founder sidebar, Manual del CEO, economía estimada Owner Dashboard, hub moderación unificado. |
| **14 jul 2026**  | Capa fiscal y anti-fraude del **programa de comisiones**. Título “Ofertas de la comunidad”.   |
| **19 jul 2026**  | Sesión Cursor intensa (~9 h). “Mis ofertas” como panel premium.                               |


**Métrica norte beta:** retención 48 h.  
**Documentación:** `docs/GUIA_AVENTA.md` unifica estado (~78% proyecto en mar 2026).

---

### ⏸️ PAUSA parcial — (may 2026)

**0 días activos · 1 mes**

Sin commits ni chats. Proyecto en mantenimiento ligero o foco en beta operativa sin código.

---

### 💰 Fase 4 — Economía, Rewards V1 y Founder OS (ago 2026)

**~52 h medidas · 11 días activos**


| Fecha              | Hito                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **14 ago 2026**    | 🔒 **Production Ready MVP**: seguridad, votos, dedupe, comisiones **40/60**, atribución. Auditoría Senior Engineer.         |
| **15 ago 2026**    | Rediseño hero + hub guías. **227 ofertas** acumuladas en Supabase prod. Fix imágenes prod.                                  |
| **18 ago 2026**    | 🎨 **Mega-rediseño Founder OS / Workspace / Equipo** — chat Cursor de ~1,086 líneas. Glass dark admin, `/equipo` operativo. |
| **20–22 ago 2026** | Bot ML escalado, moderación móvil (una tarjeta a la vez), desk moderación premium.                                          |
| **25–26 ago 2026** | Tandas UX moderación, parser ML, OG dinámico, salud ofertas. **Día más intenso: 25 ago (~12 h Cursor).**                    |
| **29 ago 2026**    | Galería imágenes moderación, fix parser `meli.la`.                                                                          |


**Rewards V1:** 15 ofertas + 15 votos, Welcome Offer, hold 60 días, mínimo $200 MXN — **OFF en producción**.

---

### 🚀 Fase 5 — Pre-lanzamiento público (ago 2026)

**~54 h medidas en agosto** (incluye **~9 h hoy**)


| Fecha           | Hito                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **30 ago 2026** | Auditoría técnica + legal + hardening + **este documento y canvas** (~9 h, ~2 p.m.–11:30 p.m.; cansado pero aquí) |
| **30 ago 2026** | Commit: *“Pre-lanzamiento: hardening, extensión V1, Rewards OFF y docs go-live.”*                                 |
| **30 ago 2026** | `LAUNCH_CHECKLIST.md`, extensión navegador V1, consentimiento legal                                               |
| **30 ago 2026** | Veredicto: **LISTO PARA GO-LIVE COMUNITARIO** (sin Rewards ni pagos)                                              |


---

## 6. Tabla mensual — días activos y horas


| Mes                 | Días activos | Horas medidas | Prom/día   | Intensidad          | Notas                                                  |
| ------------------- | ------------ | ------------- | ---------- | ------------------- | ------------------------------------------------------ |
| **2025-07**         | 5            | **26 h**      | 5,2 h      | Activo              | Idea, ChatGPT, Supabase legacy, Bubble                 |
| **2025-08**         | 1            | **3 h**       | 3 h        | Ligero              | Conversación formal idea (ChatGPT anterior)            |
| **2025-09**         | 1            | **3 h**       | 3 h        | Ligero              | Nombre Aventa, `aventa-clean`                          |
| **2025-10**         | 3            | **10 h**      | 3,3 h      | Activo              | Bubble + Supabase                                      |
| **2025-11**         | 3            | **14 h**      | 4,7 h      | Activo              | Burst `aventa-clean` (29 commits)                      |
| **2025-12**         | 0            | **0 h**       | —          | ⏸️ **PAUSA**        | —                                                      |
| **2026-01**         | 0            | **0 h**       | —          | ⏸️ **PAUSA**        | —                                                      |
| **2026-02**         | 4            | **16 h**      | 4 h        | Activo              | Repo nuevo + Supabase nuevo + Vercel                   |
| **2026-03**         | 14           | **62 h**      | 4,4 h      | 🔥 **Muy activo**   | Mes más intenso. Beta + 110 commits.                   |
| **2026-04**         | 5            | **12 h**      | 2,3 h      | Activo              | Bot ML, worker ingest                                  |
| **2026-05**         | 0            | **0 h**       | —          | ⏸️ **PAUSA**        | —                                                      |
| **2026-06**         | 4            | **14 h**      | 3,5 h      | Activo              | Founder OS, Manual CEO, hub moderación                 |
| **2026-07**         | 3            | **14 h**      | 4,7 h      | Activo              | Comisiones fiscal, Mis ofertas                         |
| **2026-08**         | 11           | **54 h**      | 4,9 h      | 🔥 **Muy activo**   | Production ready, Rewards, pre-launch; **30 ago ~9 h** |
| **TOTAL medido**    | **54**       | **~228 h**    | **~4,2 h** |                     |                                                        |
| **+ no registrado** | *tú*         | *× 5 h/día*   | —          | Estimación personal | Solo días sin evidencia                                |


---

## 7. Top 10 días más intensos


| #   | Fecha            | Horas medidas | Fase         | Qué pasó                                                  |
| --- | ---------------- | ------------- | ------------ | --------------------------------------------------------- |
| 1   | **27 mar 2026**  | **~11,4 h**   | Beta         | Cursor + 12 commits; visibilidad, comisiones              |
| 2   | **30 ago 2026**  | **~9 h**      | Hoy          | Auditorías, línea del tiempo, canvas (~2 p.m.–11:30 p.m.) |
| 3   | **25 ago 2026**  | **~9,9 h**    | Rewards      | Tandas UX moderación, OG, salud ofertas                   |
| 4   | **19 jul 2026**  | **~9 h**      | Beta         | Sesión Cursor larga                                       |
| 5   | **11 nov 2025**  | **~8 h**      | aventa-clean | 21 commits performance                                    |
| 6   | **27 feb 2026**  | **~8 h**      | Fundación    | 18 commits OAuth/PWA/legal                                |
| 7   | **6 jul 2025**   | **~8 h**      | Ideación     | Nacimiento idea + laptop nueva                            |
| 8   | **14 ago 2026**  | **~7,8 h**    | Pre-launch   | Production ready + auditoría                              |
| 9   | **26 ago 2026**  | **~6 h**      | Rewards      | Parser ML, crons                                          |
| 10  | **5–7 jul 2025** | **6–8 h**     | Ideación     | ChatGPT + plan de negocio (capturas)                      |


---

## 8. Evolución del producto — de idea a pre-launch

```
5 jul 2025     📜 “¿Cómo se llama lo del link?” (ChatGPT, 12:32 a.m.)
    ↓
6 jul 2025     💡 Idea + laptop (Promodescuentos + afiliados + recompensas)
    ↓
13 jul 2025    🗄️ Supabase + Bubble.io
    ↓
Nov 2025       ⚡ aventa-clean (Next.js B1.1)
    ↓
Dic–Ene 2026   ⏸️ PAUSA (~2 meses)
    ↓
3 feb 2026     🔄 aventa-new (reconstrucción)
    ↓
Mar 2026       🧪 Beta privada (~20 personas)
    ↓
May 2026       ⏸️ PAUSA (~1 mes)
    ↓
Jul 2026       💰 Comisiones + fiscal
    ↓
Ago 2026       🎨 Founder OS + Rewards V1 + pre-launch
    ↓
30 ago 2026    🚀 Listo para go-live comunitario
```

---

## 9. Comparativa de eras técnicas


|                   | Jul–oct 2025    | Nov 2025        | Feb 2026 → hoy                 |
| ----------------- | --------------- | --------------- | ------------------------------ |
| **Frontend**      | Bubble.io       | Next.js         | Next.js 16 + React 19          |
| **Backend/DB**    | Supabase legacy | Supabase legacy | Supabase nuevo (us-east-2)     |
| **Deploy**        | Bubble          | —               | Vercel (`aventaofertas.com`)   |
| **Auth**          | Bubble login    | —               | Google OAuth                   |
| **Monetización**  | Idea afiliados  | —               | Amazon + ML + Rewards V1 (OFF) |
| **Operaciones**   | —               | —               | Admin + Equipo + Owner OS      |
| **Ofertas en DB** | 5 (legacy)      | —               | 227 (prod actual)              |
| **Usuarios**      | 1 (legacy)      | —               | 16 perfiles (prod actual)      |


---

## 10. Conversaciones Cursor documentadas (repo actual)


| Desde       | Chat ID (abrev.) | Líneas | Tema principal                   |
| ----------- | ---------------- | ------ | -------------------------------- |
| 12 mar 2026 | `5053379e`       | 517    | Beta privada, métricas, testers  |
| 27 mar 2026 | `86a464cd`       | 136    | Errores / visibilidad            |
| 30 mar 2026 | `30dcdb5b`       | 472    | Bot / desarrollo                 |
| 2 abr 2026  | `892f465d`       | 213    | Beta                             |
| 2 jun 2026  | `4319dd9d`       | 245    | Auditoría                        |
| 24 jun 2026 | `9fd1dac1`       | 446    | OfferCard premium                |
| 15 ago 2026 | `c9cd37c9`       | 565    | Fix prod (imágenes, track-view)  |
| 18 ago 2026 | `aad55b22`       | 1,086  | **Founder OS / Equipo rediseño** |
| 26 ago 2026 | `4bd03599`       | 244    | Desarrollo                       |
| 30 ago 2026 | `94dbba07`       | 379    | Auditoría técnica pre-launch     |
| 30 ago 2026 | `b33aeb0c`       | 293    | Auditoría legal + hardening      |


> Chats en cuenta ChatGPT anterior (jul–oct 2025) no están en este repo — referenciados por capturas de pantalla.

---

## 11. Fuentes de evidencia


| Fuente                        | Qué aporta                                |
| ----------------------------- | ----------------------------------------- |
| **Git** `aventa-new`          | 232 commits, feb–ago 2026                 |
| **Git** `aventa-clean`        | 29 commits, nov 2025                      |
| **Supabase MCP**              | Fechas creación proyectos, primeros datos |
| **Cursor transcripts**        | 27 chats, 22 días con actividad           |
| **Capturas jul 2025**         | ChatGPT, Fiverr, Bubble.io, laptop Victus |
| **ChatGPT (cuenta anterior)** | **Acta 5 jul 2025 12:32 a.m.** — [`ACTA_FUNDACIONAL_AVENTA.md`](./ACTA_FUNDACIONAL_AVENTA.md) |
| `**docs/GUIA_AVENTA.md`**     | Fases pre-auditoría → beta → hoy          |
| **Dominio**                   | `aventaofertas.com`                       |


---

## 12. Anexo — capturas de pantalla de referencia

Archivos en `assets/` del workspace Cursor (jul 2025):


| Fecha (nombre archivo) | Contenido                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- |
| 20250705               | ChatGPT: afiliados, Hotmart, proyecciones $50k–$150k/mes, Promodescuentos              |
| 20250707               | Fiverr logos, Bubble.io editor, sitio `aventaficial.bubbleapps.io`, logo naranja final |
| 20260222               | (actividad posterior)                                                                  |
| 20260815               | (actividad posterior)                                                                  |


---

## 13. Próximos hitos (post documento)

- [ ] Go-live comunitario público (`LAUNCH_CHECKLIST.md`)
- [ ] Activar extensión navegador V1 (Chrome/Edge)
- [ ] Revisión legal formal antes de Rewards ON
- [ ] WakaTime/Toggl para tracking real de horas futuras

---

*Documento generado el 30 de agosto de 2026. Actualizado con contexto personal de Jafet la misma noche (~11:30 p.m.).*