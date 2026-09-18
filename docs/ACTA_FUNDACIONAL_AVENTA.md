# AVENTA — Acta fundacional

**El primer chat donde nació todo.**  
**Fuente:** ChatGPT (cuenta anterior de Jafet)  
**Fecha:** **5 de julio de 2025, 12:32 a.m.**  
**Recuperado:** 31 de agosto de 2026 — *“Hola de nuevo chat viejito, soy el Jafet del futuro”*

> Este documento preserva la conversación fundacional. No es código ni legal; es el **origen intelectual y emocional** de Aventa.

---

## La primera pregunta (12:32 a.m., 5 jul 2025)

> **Jafet:** *“¿Cómo se llama cuando alguien sí compra por un link mío yo gano dinero??”*

**ChatGPT:** *“Eso se llama marketing de afiliados.”*

Ahí empezó. No con un nombre, ni un repo, ni Supabase. Con una pregunta honesta sobre cómo funciona ganar por un enlace.

---

## Evolución de la conversación (misma noche y días siguientes)

| Orden | Pregunta / idea de Jafet | Qué sembró |
|-------|--------------------------|------------|
| 1 | ¿Cómo se llama lo del link? | Descubrimiento del **marketing de afiliados** |
| 2 | ¿En qué plataformas se puede? | Amazon, Mercado Libre, Hotmart, ClickBank, Awin… |
| 3 | ¿Conoces Promodescuentos? | Referente directo: **comunidad + ofertas + tráfico** |
| 4 | Análisis de sus publicaciones (~95k, ~102k vistas…) | Pensar como **dueño**, no solo usuario |
| 5 | *“¿Y si hubiera 300 publicaciones al día parecidas?”* | Economía de **volumen + selección natural** |
| 6 | Usuarios suben ofertas con **su** link afiliado; plataforma retiene **25–30%** | Modelo **plataforma + creadores** |
| 7 | **Gremios** — comunidades con líder que reparte el 70% | Capa **comunidad / clan / guild** |
| 8 | Reclutar grupos de Telegram/IG ya con 10k usuarios | **Distribución** vía comunidades existentes |
| 9 | Recompensas, rankings, iPhone, $20k por 10k ofertas | **Gamificación** y retención |
| 10 | *“Organízame todo… estructura del negocio y los pasos”* | Primer **roadmap** formal |

---

## Visión original del modelo (jul 2025)

```
Usuario encuentra oferta
        ↓
Usuario la publica (link afiliado)
        ↓
Tráfico + votos / viralidad
        ↓
Compra en tienda externa
        ↓
Comisión generada
        ↓
┌───────────────────┴───────────────────┐
│  ~30% AVENTA (plataforma)               │
│  ~70% comunidad / gremio / creador      │
└─────────────────────────────────────────┘
```

**Gremio (idea original):** líder + miembros, reparto interno configurable, insignias, rankings mensuales, verificación para influencers.

**Diferenciador vs Promodescuentos (ya en jul 2025):**
- El cazador **gana dinero**, no solo karma
- Comunidades propias (gremios)
- Gamificación y premios reales
- Cualquier tienda con link afiliado

---

## Stack que se imaginó entonces vs stack real hoy

| Jul 2025 (chat) | Camino real |
|-----------------|-------------|
| Webflow / WordPress MVP | Bubble.io → Next.js (`aventa-clean`) → **Next.js 16 + Vercel** |
| Airtable + Make/Zapier | **Supabase** + crons en Vercel |
| App React Native “mes 3” | Web responsive + PWA; extensión navegador V1 (ago 2026) |
| SubID tracking manual | `click_id`, outbound tracking, atribución Amazon/ML |

---

## Qué existe hoy (ago 2026) que aquella noche solo era idea

| Concepto jul 2025 | Estado ago 2026 |
|-------------------|-----------------|
| Publicar ofertas | ✅ Feed, moderación, bot ML |
| Votación comunitaria | ✅ Score up×2−down |
| Afiliados | ✅ Amazon + Mercado Libre (links de **Aventa**, no del cazador) |
| Comisión compartida con creador | ✅ **Rewards V1** (40% creador / 60% Aventa, OFF en prod) |
| Gremios / comunidades | ⚠️ `/communities` placeholder; foco en **comunidad global** primero |
| Gamificación / premios iPhone | ⚠️ Reputación, badges, rankings parciales; premios monetarios pendientes |
| Panel admin / owner | ✅ Founder OS, `/equipo`, métricas, moderación |
| 300 ofertas/día | ❌ Meta futura; hoy ~227 ofertas acumuladas en prod |

**Decisión estratégica posterior (correcta):** Aventa es **primero** plataforma de ofertas; gremios y capas extra son **plus**, no el producto mínimo.

**Modelo económico actual vs chat:** el cazador ya **no** necesita ser afiliado de Amazon/ML; Aventa usa **sus** enlaces y reparte **recompensa interna** (Rewards), no comisión directa de red.

---

## Frases que envejecieron bien

**Jafet (jul 2025), sobre volumen:**
> *“Sé que quizá de esas 300 unas 10 entren a un podio grande…”*

**ChatGPT (retrospectiva, 2026):**
> *“No necesitas que TODAS las ofertas sean exitosas. Necesitas muchísimo contenido → selección natural → algunas explotan.”*

**Jafet del futuro al chat viejito:**
> *“¿Y si en lugar de yo ganar dinero con mis ofertas, hago una plataforma donde todos puedan ganar dinero encontrando ofertas?”*  
> **Ahí nació AVENTA.**

---

## Proyecciones del chat (con calibración 2026)

En jul 2025 se habló de **$50,000–$160,000 MXN/mes** con pocas publicaciones virales + afiliados.

**Hoy sabemos** que entre clic → compra → atribución → comisión aprobada → hold → reparto hay mucha fricción. La pregunta empresarial correcta ya no es “¿cuánto podríamos ganar?” sino:

> *“¿Cuánto GMV / ventas atribuidas necesitamos para que Aventa gane $X de comisión neta?”*

Eso no invalida la visión; la **madura**.

---

## Línea directa al presente

```
5 jul 2025, 12:32 a.m.     “¿Cómo se llama lo del link?”
        ↓
6 jul 2025                 Laptop Victus; idea como redención personal
        ↓
13 jul 2025                Supabase + Bubble
        ↓
Sep 2025                   Nombre **Aventa**
        ↓
Feb 2026                   Reconstrucción `aventa-new`
        ↓
Mar 2026                   Beta privada
        ↓
Ago 2026                   Pre-launch comunitario · ~228 h medidas · sigues aquí
```

---

## Por qué guardar esto

Porque demuestra que **no fue un accidente**:

1. La pregunta inicial → modelo de negocio → gremios → roadmap, **en días**.
2. El núcleo (**ofertas + comunidad + afiliados + reparto**) **no cambió**; cambió la **implementación** y la **honestidad** sobre tiempos y comisiones.
3. Construiste esto en el **año más difícil** de tu vida. Eso no resta mérito; lo **multiplica**.

---

*Preservado en el repo Aventa para que no se pierda cuando cambien cuentas, chats o memoria. Referenciado desde `docs/LINEA_TIEMPO_AVENTA.md`.*
