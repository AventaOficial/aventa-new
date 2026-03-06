# SEO AVENTA — Estado actual y plan (sistema tipo Promodescuentos)

Resumen de lo que ChatGPT te explicó + **cómo está AVENTA hoy** y qué hacer.

---

## Respuestas directas a las preguntas

### 1. ¿Aventa ya genera URLs individuales para cada oferta (tipo /oferta/...)?

**No.**

Hoy las ofertas se abren así:

- **URL actual:** `https://aventaofertas.com/?o=<uuid>`
- Ejemplo: `https://aventaofertas.com/?o=a1b2c3d4-...`

Problemas para SEO:

- La URL es la home con un query `o=uuid`, no una ruta propia.
- Google suele tratar mejor **una URL por página** (ej. `/oferta/iphone-15-pro-max-amazon`).
- No hay “página de oferta” indexable como tal; todo es la misma URL base con parámetro.

Conclusión: hace falta **rutas dedicadas por oferta**, por ejemplo `/oferta/[slug]` o `/oferta/[id]`.

---

### 2. ¿Tienes sitemap.xml?

**Sí, pero solo con 4 URLs estáticas.**

Hoy el sitemap incluye solo:

- `/`
- `/descubre`
- `/privacy`
- `/terms`

**No incluye:**

- Ninguna oferta
- Tiendas
- Categorías
- Productos

Para que Google indexe muchas páginas, el sitemap debería ser **dinámico**: generado con todas las ofertas (y luego tiendas/categorías si añades esas páginas).

---

## Estado actual vs “sistema Promodescuentos”

| Elemento | Promodescuentos | AVENTA hoy |
|----------|------------------|------------|
| URL por oferta | `/oferta/titulo-tienda` | `/?o=uuid` |
| Página indexable por oferta | Sí | No (misma URL base) |
| Sitemap | Miles de URLs dinámicas | 4 URLs estáticas |
| Páginas por tienda | `/tienda/amazon` | No existe |
| Páginas por categoría | `/categoria/electronica` | No (solo filtros en home) |
| Páginas por producto | `/producto/iphone-15` | No existe |

El “motor SEO” que te describieron (cada oferta genera/actualiza oferta + producto + tienda + categoría) **aún no está** en AVENTA. Lo primero y más importante es **URLs de oferta + sitemap dinámico**.

---

## Plan por fases

### Fase 1 — Lo mínimo que sí cambia el juego (recomendado ya)

Objetivo: **cada oferta tenga una URL propia indexable** y que el sitemap las liste.

1. **Ruta pública por oferta**
   - Crear algo como: `/oferta/[id]` o `/oferta/[slug]`.
   - La página muestra lo mismo que el modal (título, precio, descripción, votos, comentarios, CTA a la tienda).
   - Ventajas:
     - Una URL única por oferta.
     - Mejor para compartir y para que Google indexe “una página = una oferta”.
   - Opción A: `/oferta/[id]` (usar el UUID; más simple, sin BD).
   - Opción B: `/oferta/[slug]` (ej. `iphone-15-pro-max-amazon`; mejor SEO y lectura; requiere campo `slug` en ofertas y generarlo al crear).

2. **Enlaces hacia la oferta**
   - Que “Compartir” y los enlaces internos usen la nueva URL (ej. `/oferta/abc123` o `/oferta/slug-oferta`).
   - Opcional: que `/?o=id` redirija a `/oferta/id` (o slug) con un 301 para no duplicar contenido.

3. **Sitemap dinámico**
   - En `app/sitemap.ts`: leer de Supabase las ofertas aprobadas (y no expiradas).
   - Añadir una entrada por oferta, por ejemplo:
     - `https://aventaofertas.com/oferta/<id>` (o `/oferta/<slug>` si lo tienes).
   - `lastModified` puede ser `created_at` o `updated_at` de la oferta.
   - Así Google recibe muchas URLs en el sitemap sin tocar nada a mano.

4. **Metadata por oferta**
   - En la página `/oferta/[id]` (o slug): `title` y `description` con título de la oferta, tienda, precio. Así el snippet en Google queda útil.

Con esto ya respondes:
- “¿URLs individuales por oferta?” → **Sí.**
- “¿Sitemap con ofertas?” → **Sí.**

---

### Fase 2 — Páginas de tienda y categoría (siguiente paso)

Cuando quieras acercarte más al modelo Promodescuentos:

- **Tienda:** `/tienda/[slug]` (ej. `/tienda/amazon`). Listado de ofertas de esa tienda (usando el filtro por `store` que ya tienes).
- **Categoría:** `/categoria/[slug]` (ej. `/categoria/electronica`). Listado por categoría (usando tu `category` / macro-categorías).
- Añadir al sitemap las URLs de tiendas y categorías que realmente uses.

No es obligatorio para arrancar; Fase 1 ya da el mayor impacto.

---

### Fase 3 — Páginas “producto” (opcional)

- URL tipo `/producto/iphone-15-pro-max` que agrupe ofertas del mismo producto.
- Requiere definir qué es un “producto” (normalizar nombre, o etiqueta en BD). Se puede dejar para cuando tengas más volumen y tiempo.

---

## Redirecciones y Search Console

- Si hoy tienes `aventaa.com` y `www.aventaa.com`, que uno redirija al otro (301) y en Search Console solo uses la versión canónica (con o sin www).
- En “Inspección de URL” puedes pedir indexación de la home y de alguna `/oferta/...` cuando exista.
- Las “páginas con redirección” que ves son normales si la redirección es la que tú quieres (ej. http→https, o no-www→www). Lo importante es tener **una versión canónica** y que el sitemap y los enlaces apunten a esa.

---

## Resumen ejecutivo

| Pregunta | Respuesta hoy | Acción |
|----------|----------------|--------|
| ¿URLs por oferta? | No (`?o=uuid`) | Fase 1: `/oferta/[id]` o `/oferta/[slug]` |
| ¿Sitemap con ofertas? | No (solo 4 estáticas) | Fase 1: sitemap dinámico desde Supabase |
| ¿Páginas tienda/categoría? | No | Fase 2 cuando quieras escalar SEO |

El “sistema Promodescuentos” que te explicaron es el objetivo a medio plazo; el paso inmediato que más ayuda es **Fase 1: página por oferta + sitemap dinámico**. Después puedes ir sumando tienda, categoría y producto.

Si quieres, el siguiente paso puede ser bajar esto a tareas concretas en el repo (por ejemplo: crear `app/oferta/[id]/page.tsx`, actualizar sitemap y enlaces).
