# AVENTA vs Promodescuentos — Cómo funciona cada sistema

Comparación directa: **Promodescuentos** (modelo probado, con economía y recompensas) vs **AVENTA** (nuestro modelo actual: reputación interna, sin economía aún).

---

## 1. Votos sobre ofertas

| Aspecto | Promodescuentos | AVENTA |
|--------|------------------|--------|
| **Qué se vota** | Ofertas: “bueno” / “malo” (caliente/frío). | Ofertas: upvote / downvote. |
| **Unidad visible** | “Grados” (temperatura). Oferta **Hot** = 100 grados. | Score numérico; en el feed se ordena por ranking, no se muestra el score crudo. |
| **Fórmula del score** | No pública; se traduce a “grados” / temperatura. | **Score = (upvotes × 2) − (downvotes × 1).** Up vale el doble que down. |
| **Peso del voto** | Un voto = un voto (o lógica no publicada). | **Peso por reputación del votante** (solo backend): Nivel 1: +2/−1; 2: +2.2/−1.1; 3: +2.5/−1.2; 4: +3/−1.5. |
| **Uso del score** | Ordenar ofertas; umbral Hot (100°) para puntos. | Ordenar feed: **ranking_blend** = ranking_momentum + reputation_weighted_score; decay temporal; vista “Top” por score_final. |

**Resumen:** En PD los votos definen “grados” y el hito Hot (100°). En AVENTA los votos generan un score up×2−down y un **ranking ponderado por reputación** (ranking_blend) para el feed.

---

## 2. Ofertas: publicación y moderación

| Aspecto | Promodescuentos | AVENTA |
|--------|------------------|--------|
| **Quién publica** | Usuarios; ofertas suben y la comunidad vota. | Usuarios; flujo igual. |
| **Moderación** | Implícita (comunidad + equipo). Oferta Hot = validada por votos. | **Explícita:** cola de moderación. Pendientes → Aprobada/Rechazada por moderadores. |
| **Cuándo es “válida”** | Al llegar a 100 grados (Hot). | Cuando un **mod** la aprueba, o si el autor tiene **nivel ≥ 3** (auto-aprobación, visible en “Nuevas”). |
| **Hito destacado** | Hot = 100 grados → da puntos al autor. | Sin hito público; la “recompensa” es reputación interna (más nivel, más confianza, más peso de voto). |

**Resumen:** PD usa “Hot” como señal de calidad y como gatillo de puntos. AVENTA usa **moderación humana + auto-aprobación por nivel** y no tiene un “Hot” que dé puntos.

---

## 3. Comentarios

| Aspecto | Promodescuentos | AVENTA |
|--------|------------------|--------|
| **Reacciones** | “Útil” (palomita verde ✅); “me gusta” no cuenta para puntos. | **Like** en comentarios; cuenta para **reputación** del autor (+1 por like recibido). |
| **Qué da puntos (PD) / reputación (AVENTA)** | Comentario “útil” = ≥3 reacciones útiles → hasta 10 puntos. | Comentario aprobado: +2 reputación. Rechazado: −5. Like recibido: +1. |
| **Moderación** | Implícita (reacciones útiles). | **Explícita:** comentarios pending → aprobado/rechazado por mods; **nivel ≥ 2** → comentarios auto-aprobados. |
| **Hilos** | Sí (discusiones). | Sí: **respuestas** (parent_id) y likes. |

**Resumen:** En PD “útil” = 3 reacciones → puntos. En AVENTA los likes y la moderación alimentan **reputación** y niveles; no hay “puntos” canjeables.

---

## 4. Reputación / Niveles (usuario)

| Aspecto | Promodescuentos | AVENTA |
|--------|------------------|--------|
| **Nombre** | Puntos de contribución + niveles de colaborador. | **Reputación interna:** reputation_score, reputation_level, is_trusted. |
| **Cómo se gana** | Oferta Hot: hasta 10 pts. Comentario útil (≥3 palomitas): hasta 10 pts. | +10 oferta aprobada, −15 rechazada; +2 comentario aprobado, −5 rechazado; +1 like recibido. |
| **Niveles** | **Plata** (10+), **Oro** (40+), **Platino** (300+). | **Nivel 1** (0–49) Nuevo, **2** (50–199) Contribuidor, **3** (200–499) Cazador Pro, **4** (500+) Elite. |
| **Expiración** | Puntos válidos 12 meses; pueden bajar si oferta deja de ser Hot o quitan reacciones. | Score no expira; sube/baja con aprobaciones/rechazos y likes. |
| **Degradación** | Si caes bajo el mínimo del nivel 7 días seguidos → bajas de nivel. | No implementada; el nivel es el que toca por score actual. |
| **Visible** | Puntos y nivel en perfil; recompensas por nivel. | **Barra de nivel** en perfil (Nivel X – Nuevo/Contribuidor/Cazador Pro/Elite). Score no se muestra como número. |

**Resumen:** PD = puntos con expiración y recompensas tangibles. AVENTA = **reputación interna** con niveles y beneficios de confianza (auto-aprobación, peso de voto), sin economía aún.

---

## 5. Efectos de la reputación

| Aspecto | Promodescuentos | AVENTA |
|--------|------------------|--------|
| **Moderación** | No hay cola explícita de “pendientes”; Hot = validación por votos. | **Nivel 1:** todo a moderación. **Nivel 2+:** comentarios auto-aprobados. **Nivel 3+:** ofertas auto-aprobadas. |
| **Votos** | Mismo peso por voto (o no publicado). | **Peso por nivel del votante:** nivel 4 suma/resta más que nivel 1 (solo backend). |
| **Recompensas** | Íconos, referidos (2/10/ilimitado), tarjetas Amazon, Racha de Categorías. | **Ninguna economía aún.** Solo ventajas de flujo: menos moderación y más peso de voto. |

**Resumen:** En PD la reputación desbloquea **recompensas**. En AVENTA desbloquea **confianza** (menos fricción, más influencia en el ranking).

---

## 6. Ranking del feed

| Aspecto | Promodescuentos | AVENTA |
|--------|------------------|--------|
| **Señal principal** | Grados / temperatura (votos). | **ranking_blend** = ranking_momentum + reputation_weighted_score. |
| **Tiempo** | Ofertas nuevas vs antiguas (lógica no publicada). | **Decay temporal** (tipo Reddit/HN): tiempo en denominador para que lo nuevo suba. |
| **Engagement** | Compartidos, etc. (Oro/Platino ven más estadísticas). | outbound_24h, ctr_24h forman parte de ranking_momentum. |
| **Vistas** | Hot, recientes, categorías… | **General** (ranking_blend), **Top** (score_final), **Recientes / Para ti** (created_at). |

**Resumen:** PD ordena por “grados”/temperatura y tiempo. AVENTA ordena por **ranking_blend** (votos ponderados por reputación + momentum + tiempo/engagement).

---

## 7. Resumen en una frase

- **Promodescuentos:** Sistema de **puntos con expiración** que se ganan con ofertas Hot y comentarios útiles; **niveles (Plata/Oro/Platino)** que dan **recompensas reales** (referidos, Amazon, íconos). Los votos definen “grados” y el hito Hot.
- **AVENTA:** Sistema de **reputación interna** (score + niveles 1–4) que **no se canjea**; define **quién pasa por moderación**, **peso del voto** en el ranking y **orden del feed** (ranking_blend). Sin economía ni recompensas tangibles todavía.

---

## 8. Dónde ya estamos mejor (y qué tienen ellos de malo que nosotros hacemos bien)

| Lo que PD hace mal o a medias | Cómo lo hacemos nosotros mejor |
|-------------------------------|---------------------------------|
| **Voto plano:** todo el mundo pesa igual → fácil manipulación y granos de arena. | **Peso por reputación:** quien aporta calidad (nivel alto) tiene más influencia; el voto de un Elite cuenta más que el de un Nuevo. |
| **Hot = 100 grados:** umbral fijo incentiva farmear votos y campañas para llegar a 100. | **Moderación explícita + auto-aprobación por nivel:** la calidad la define confianza ganada (aprobaciones, comentarios útiles, likes), no un número mágico. |
| **Puntos expiran 12 meses:** presión artificial, degradación por tiempo, no por comportamiento. | **Reputación sin expiración por tiempo:** sube y baja por lo que haces (aprobado/rechazado, likes), no por calendario. |
| **“Útil” = 3 palomitas:** umbral bajo, fácil de inflar; “me gusta” no cuenta → dos sistemas paralelos. | **Un solo sistema:** like en comentarios alimenta reputación; moderación humana para contenido tóxico; nivel ≥ 2 evita cola en comentarios. |
| **Validación = votos (Hot):** oferta puede ser mala y llegar a Hot con coordinación. | **Validación = moderación + confianza del autor:** ofertas pendientes revisadas por mods; autores de nivel 3+ no saturan la cola. |
| **Recompensas atadas a niveles:** incentiva subir de nivel para referidos/Amazon → más ruido. | **Sin economía aún:** el incentivo es confianza (menos fricción, más peso). Cuando haya economía, será por impacto real, no por “subir de nivel para vender”. |

**Conclusión:** Nuestro sistema es **mejor en señales** (reputación, peso de voto, moderación explícita) y **mejor en incentivos** (no expira por tiempo, no premia el grano de arena). Lo que nos falta para estar a la altura o superarlos es **producto y escala**, no copiar sus reglas.

---

## 9. Qué nos falta para estar a la altura o superarlos

Objetivo: **ser la mejor opción** — mismo nivel o por encima en experiencia y confianza, sin repetir sus errores.

### Hecho (o en camino)

- Reputación interna y niveles (Nuevo → Elite).
- Peso de voto por reputación (ranking_blend).
- Moderación explícita (ofertas + comentarios) y auto-aprobación por nivel.
- Baneos, reportes, roles (moderador vs owner).
- Respuestas y likes en comentarios; barra de nivel en perfil.

### Falta (para estar a la altura / superar)

1. **Señal clara de “esta oferta es buena”**  
   Ellos tienen “Hot” (100°). Nosotros no mostramos un hito equivalente. Opción: un **badge o etiqueta** (ej. “Destacada” o “Alta calidad”) basado en **ranking_blend + umbral + antigüedad**, sin que ese hito dé puntos ni recompensas — solo descubribilidad y confianza visual. Así evitamos el “farmear para 100” y mantenemos la señal.

2. **Descubribilidad y filtros**  
   Categorías, búsqueda sólida, filtros por tienda/precio/antigüedad. Que el usuario encuentre rápido lo que le interesa sin depender solo del feed general.

3. **Claridad de qué aporta cada nivel**  
   En perfil ya está la barra (Nivel X – Contribuidor, etc.). Falta una **mini explicación** (tooltip o página “Cómo funciona”) de qué implica cada nivel (auto-aprobación, peso de voto) para que la gente entienda por qué importa la reputación.

4. **Experiencia de publicación y moderación**  
   Que publicar sea rápido y claro; que los mods tengan herramientas cómodas (filtros, acciones en lote, historial). Así la calidad sube y la confianza se nota.

5. **Escala y medición**  
   Métricas de impacto real: ofertas que generan clicks/salidas, comentarios que reciben likes, tiempo en oferta. Eso alimenta después la **recompensa por impacto** (ver abajo) y nos permite mejorar el ranking sin depender de “grados” opacos.

6. **No copiar**  
   No introducir: expiración de puntos por tiempo, umbral fijo tipo “100 = Hot” que dé puntos, ni recompensas que incentiven “subir de nivel para vender”. Nosotros premiamos **calidad e impacto**, no volumen ni trucos.

---

## 10. Economía: después de confianza y del sistema

La economía **va aparte** y **después** de tener bien cerrado: reputación, moderación, peso de voto y feed.

- **Objetivo:** Pagar **por impacto**, y **muy por abajo** — no llenar la página de gente que solo quiere vender y ganar dinero.
- **Idea:** Recompensar a quien **da calidad** y **genera impacto real** (ofertas que la gente usa, comentarios que ayudan, señales que mejoran el feed). No recompensar por “tener nivel” ni por “llegar a 100”.
- **Fase:** Primero confianza y sistema (niveles, moderación, ranking_blend, señal “Destacada” si se añade, métricas de impacto). Cuando eso esté estable, diseñar **recompensa por impacto** (baja, acotada, orientada a calidad). Eso se desarrolla en un siguiente paso, sin atar la reputación actual a dinero hasta tener las reglas y métricas claras.
