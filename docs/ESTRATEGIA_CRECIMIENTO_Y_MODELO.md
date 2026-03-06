# Estrategia de crecimiento y modelo de plataforma — AVENTA

**Documento:** Recomendación estratégica pre-lanzamiento  
**Fuente de verdad:** Codebase y documentación en `/docs` (GUIA_AVENTA, OBJETIVOS_Y_NECESIDADES, FEEDBACK_Y_ROADMAP, AUDITORIA_COMPLETA).

---

## 1. Comparación Modelo A vs Modelo B

| Dimensión | Modelo A — Foro de ofertas | Modelo B — Comunidad de cazadores |
|-----------|----------------------------|-----------------------------------|
| **Objeto central** | La oferta (deal) | La persona que encuentra la oferta (cazador) |
| **Tráfico** | SEO, volumen de páginas, búsqueda | Seguidores, notificaciones, identidad |
| **Contribuidores** | Anónimos o poco visibles; el deal importa más que quien lo sube | Reconocibles; reputación y perfil como incentivo |
| **Loop principal** | Llega → ve oferta → vota/comenta → convierte (afiliado) | Cazador sube → comunidad vota → cazador gana reputación → más seguidores → sube más |
| **Métrica clave** | Páginas indexadas, ofertas/día, CTR, conversión | Reputación, seguidores por cazador, engagement por perfil |
| **Escalado** | Contenido (ofertas) escala con moderación y SEO | Contenido escala con número de “cazadores” activos y su visibilidad |

---

## 2. Riesgos en etapa temprana (pocos usuarios)

### Modelo A — Foro tradicional

| Riesgo | Impacto |
|--------|--------|
| **Cold start** | Poco contenido → poco tráfico SEO → poco contenido. El feed se ve vacío y la retención cae. |
| **Dependencia de SEO** | Tardar meses en rankear; si no hay volumen de ofertas, las long-tail no despegan. |
| **Commoditización** | Competir en “más ofertas” contra Pepper (Promodescuentos) es difícil con menos recursos. |

**Mitigación ya en AVENTA:** Ofertas de testers (15 ofertas de ejemplo), digest (Top 10, semanal), métrica retención 48h. El doc OBJETIVOS_Y_NECESIDADES apuesta por contenido mínimo (~50 ofertas/día curadas al inicio) y categorías claras (vitales, bancarias, tech).

### Modelo B — Comunidad social de cazadores

| Riesgo | Impacto |
|--------|--------|
| **Critical mass de “cazadores”** | Con 20–100 usuarios, casi no hay “hunters” reconocibles; el loop “reputación → más publicaciones” no arranca. |
| **Seguir a alguien** | Sin grafo de seguidores, “follow hunters” no genera retención. Requiere feature y adopción. |
| **Identidad antes de contenido** | Si se enfatiza “los cazadores” antes de tener ofertas suficientes, el usuario llega y no ve valor (pocas ofertas, pocos cazadores). |

**Conclusión:** En etapa cero o muy temprana, Modelo B es más arriesgado: necesita primero ofertas y luego gente que destaque. Modelo A puede funcionar con menos usuarios si hay contenido curado (owner/equipo + testers).

---

## 3. Alineación con la arquitectura actual de AVENTA

### Lo que ya soporta Modelo A (foro / ofertas como centro)

| Feature | Dónde |
|--------|--------|
| **Ofertas como objeto central** | Feed por ranking_blend, score, vistas Top/Recientes/Día a día/Para ti. |
| **SEO** | `/oferta/[id]`, `/categoria/[slug]`, `/tienda/[slug]`, sitemap, canonical, JSON-LD. |
| **Ranking por comunidad** | up×2−down, score_final, ranking_blend (novedad + calidad). |
| **Afiliado y conversión** | track-outbound, CTR por oferta, buildOfferUrl (ml_tracking_tag). |
| **Moderación** | Pendiente → Aprobado/Rechazado/Expirado; reportes; contenido curado. |
| **Búsqueda y filtros** | Por tienda, categoría, texto (título, tienda, descripción). |

### Lo que ya soporta Modelo B (cazadores / identidad)

| Feature | Dónde |
|--------|--------|
| **Perfil público** | `/u/[username]`, ofertas del usuario, avatar. |
| **Reputación** | reputation_score, reputation_level, ReputationBar, recalculate_user_reputation. |
| **Badges de cazador** | leader_badge (cazador_estrella, cazador_aventa), visibles en card y página oferta (“Cazado por X”). |
| **Peso de reputación en ranking** | reputation_weighted_score en ofertas; ranking_blend = ranking_momentum + reputation_weighted_score. |
| **Atribución en enlace** | ml_tracking_tag para links de ofertas de líderes (monetización/creator). |
| **Digest y reconocimiento** | Digest “Top 10”, “Top 3 cazadores”; notificación al autor por like. |
| **Mensaje de marca** | FRASES_AVENTA: “La comunidad que caza las mejores ofertas por ti”; “Cazado por {username}”. |

### Conclusión de alineación

**AVENTA es un híbrido con base en Modelo A y elementos de Modelo B ya implementados.**  
- El flujo principal es: oferta → votación → ranking → descubrimiento → conversión (A).  
- La capa “cazador” existe: autor visible, reputación, badges, ranking ponderado por reputación, digest con cazadores (B), pero **no hay grafo de seguidores** ni “feed de un cazador”.  
- Para lanzar desde cero, la arquitectura **soporta mejor** un uso tipo A (priorizar ofertas, SEO, volumen) y usar B como **narrativa y diferenciación** (badges, “cazado por”, reputación) sin depender de “seguir cazadores” todavía.

---

## 4. Estrategia recomendada: híbrido con prioridad A

### Por qué no elegir solo uno

- **Solo A:** Funciona para arrancar, pero en México Promodescuentos (Pepper) ya ocupa el espacio “foro de ofertas”. Competir solo en volumen y SEO es costoso.
- **Solo B:** Con 0–100 usuarios no hay suficientes cazadores reconocibles; el loop social es débil y el valor (“encontrar ofertas”) puede quedar en segundo plano.

### Híbrido propuesto

1. **Motor de crecimiento (primeros 6–12 meses): Modelo A**  
   - Objetivo: volumen de ofertas útiles, SEO, retención (ej. retención 48h), CTR.  
   - La oferta es el imán; el usuario viene por “una oferta” o “ofertas en México/vitales/bancarias”.

2. **Narrativa y diferenciación: Modelo B**  
   - Mensaje: “comunidad de cazadores”, “cazado por X”, badges, reputación.  
   - No construir aún “seguir cazadores” ni feed por cazador; sí reforzar autor visible, reputación y digest “Top cazadores” para dar identidad y motivar a quien sube.

3. **Posicionamiento frente a Pepper (Promodescuentos)**  
   - No competir de frente en “más ofertas / más países”.  
   - Competir en **enfoque**: México primero, vitales + bancarias + tech (OBJETIVOS_Y_NECESIDADES), mensaje “cazadores” y reputación simple.  
   - Ventaja posible: claridad (“ofertas que importan”), categorías y filtros (ej. bancarias), experiencia más enfocada que un foro genérico.

---

## 5. Pepper (HotUKDeals / Promodescuentos) y opción para competir

### Modelo Pepper (resumen)

- **Producto:** Comunidad de ofertas en 12 países; Promodescuentos en España/LATAM, HotUKDeals en UK, etc.  
- **Modelo de negocio:** Afiliación + publicidad (self-serve para retailers); Creator Program (usuarios cualificados ganan por rendimiento).  
- **Crecimiento:** Volumen (25M usuarios/mes), muchas ofertas, SEO, marca consolidada.  
- **Comunidad:** Votación, “hot” deals, puntos y niveles (Silver/Gold/Platinum), recompensas; moderación y reportes.

### Opciones para AVENTA

| Opción | Descripción | Viabilidad |
|--------|-------------|------------|
| **Competir en volumen** | Mismas reglas que Pepper: más ofertas, más países, más SEO. | Baja con recursos limitados; Pepper ya tiene escala y marca. |
| **Competir en nicho** | Un solo mercado (México) y tipos de oferta (vitales, bancarias, tech). Mensaje claro y categorías curadas. | Alta: permite “mejor para MX” y “ofertas que importan”. |
| **Competir en identidad** | “Cazadores” y reputación como eje; comunidad más pequeña pero más reconocible. | Media: viable cuando haya suficientes cazadores activos (después de tener ofertas). |
| **Complementar** | No sustituir a Promodescuentos; ser la opción “enfocada en México / vitales / bancarias” para quien quiera eso. | Alta: reduce presión de competencia directa y define un espacio propio. |

**Recomendación:** No intentar “ser otro Promodescuentos”. **Competir por foco y claridad:** México, vitales + bancarias + tech, mensaje “comunidad de cazadores”, reputación y badges ya implementados. Crecer con Modelo A (ofertas, SEO, retención) y usar Modelo B como narrativa y diferenciación (cazadores, “cazado por”, Top cazadores) hasta tener base de contenido y datos para decidir si invertir más en social (seguir cazadores, feed por cazador).

---

## 6. Enfoque primeros 6 meses tras el lanzamiento

### Prioridad 1: Estabilidad y contenido (Modelo A)

- Cerrar E2E y checklist de lanzamiento (GUIA_AVENTA, LAUNCH_CHECKLIST_BETA).  
- Asegurar volumen mínimo de ofertas (curado por equipo + comunidad); objetivo orientativo ~50 ofertas/día (OBJETIVOS_Y_NECESIDADES).  
- Métricas: retención 48h, ofertas subidas, vistas, CTR; mejorar contenido y claridad si CTR sigue bajo (FEEDBACK_Y_ROADMAP).  
- SEO: mantener sitemap, canonical, JSON-LD; no añadir features pesadas que desvíen de “encontrar ofertas”.

### Prioridad 2: Narrativa “cazadores” (Modelo B ligero)

- Comunicar “cazado por X”, badges (cazador_estrella, cazador_aventa) y reputación en la UI y en redes (FRASES_AVENTA).  
- Digest “Top cazadores” y notificaciones al autor (like, aprobación) ya existen; asegurar que se usen y se mencionen.  
- No construir “seguir cazadores” ni feed por cazador en estos 6 meses; solo reforzar lo que ya hay.

### Prioridad 3: Diferenciación frente a Pepper

- Mensaje claro: “La comunidad que caza las mejores ofertas por ti” (México, vitales, bancarias, tech).  
- Categorías y filtros que destaquen ofertas bancarias y vitales (según OBJETIVOS_Y_NECESIDADES).  
- Posicionar como “la opción enfocada en México” en lugar de “el Promodescuentos de México”.

### No priorizar en 6 meses

- Páginas producto (`/producto/[slug]`).  
- Grafo social (seguir cazadores, feed “de un cazador”).  
- Programa de puntos/recompensas tipo Pepper (P2/P3 según roadmap).

---

## 7. Resumen ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| **¿Qué modelo soporta mejor la arquitectura actual?** | Híbrido: A como motor (ofertas, ranking, SEO), B ya presente (perfiles, reputación, badges, ranking con reputación, digest cazadores). |
| **¿Qué modelo es más viable desde cero usuarios?** | Modelo A: el valor es “encontrar ofertas”; con contenido curado y SEO se puede atraer y retener. Modelo B necesita antes base de ofertas y luego cazadores visibles. |
| **¿Estrategia recomendada?** | Híbrido con prioridad A: crecer por ofertas, SEO y retención; usar B como narrativa y diferenciación (cazadores, reputación) sin construir grafo social aún. |
| **¿Cómo competir con Pepper/Promodescuentos?** | Por foco: México, vitales + bancarias + tech, mensaje “cazadores”; no por volumen ni países. Complementar más que reemplazar. |
| **¿Enfoque primeros 6 meses?** | Estabilidad, contenido mínimo, retención 48h y CTR (A); reforzar mensaje y uso de badges/reputación/digest (B ligero); posicionar como opción enfocada en México. |

---

*Documento basado en la documentación en `/docs` y en el estado actual del producto. No sustituye decisiones de producto; sirve como marco para alinear crecimiento y modelo de plataforma.*
