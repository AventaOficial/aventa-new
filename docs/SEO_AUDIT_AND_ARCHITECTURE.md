# Auditoría SEO y arquitectura — AVENTA

Informe técnico y de producto sobre SEO, indexabilidad y arquitectura escalable para una comunidad de ofertas tipo Promodescuentos.

---

## 1. Resumen de la arquitectura actual (post-implementación)

### Rutas implementadas

| Ruta | Tipo | Contenido | Indexable |
|------|------|-----------|-----------|
| `/` | Home | Feed de ofertas, búsqueda, filtros | Sí |
| `/oferta/[id]` | Página de oferta | Detalle completo: título, precio, votos, comentarios, tienda, categoría, CTA afiliado | Sí |
| `/categoria/[slug]` | Listado por categoría | Ofertas de una macro-categoría (tecnologia, gaming, hogar, etc.) | Sí |
| `/tienda/[slug]` | Listado por tienda | Ofertas de una tienda (slug derivado del nombre) | Sí |
| `/descubre` | Estático | Explicación del producto | Sí |
| `/u/[username]` | Perfil público | Ofertas y datos del usuario | Sí |
| `/privacy`, `/terms` | Legales | Texto estático | Sí |
| `/me`, `/settings`, `/admin/*` | Área usuario/admin | No indexables (robots.txt) | No |

### Comportamiento actual

- **Canonical:** Cada oferta tiene URL canónica `/oferta/[id]`. Categoría y tienda tienen canonical en `generateMetadata`.
- **Redirección:** `/?o=id` → 301 a `/oferta/id` (middleware).
- **Compartir:** Enlaces de compartir usan `/oferta/[id]`.
- **Sitemap:** Dinámico desde Supabase: home, estáticas, categorías, tiendas, ofertas aprobadas y no expiradas (hasta 10k ofertas).
- **Enlaces internos:** En la página de oferta hay enlaces a `/categoria/[slug]` y `/tienda/[slug]`. En categoría hay enlaces a otras categorías y a cada oferta. En tienda hay enlace a cada oferta y a inicio.

### Lo que falta respecto a un “Promodescuentos completo”

- **Páginas producto:** `/producto/[slug]` para agrupar ofertas por producto (ej. “iPhone 15 Pro Max”). No implementado; requiere modelo de datos o normalización de título.
- **Structured Data (JSON-LD):** Product, Offer, AggregateRating para ofertas. No implementado.
- **Open Graph por oferta:** Implementado (título, descripción, imagen, url). Falta revisar que la imagen sea absoluta.
- **Rendimiento:** Imágenes con `<img>` en muchos sitios; no se usa `next/image` de forma consistente (afecta LCP y Core Web Vitals).

---

## 2. Problemas críticos de SEO (resueltos y pendientes)

### Resueltos en esta implementación

- **URL única por oferta:** Antes `/?o=uuid`; ahora `/oferta/[id]` como página dedicada.
- **Contenido duplicado:** Redirección 301 de `?o=id` a `/oferta/id` y canonical en la página de oferta.
- **Sitemap estático:** Sustituido por sitemap dinámico con ofertas, categorías y tiendas.
- **Falta de páginas de listado:** Añadidas `/categoria/[slug]` y `/tienda/[slug]`.
- **Enlaces internos:** Oferta → categoría y tienda; categoría → ofertas y otras categorías; tienda → ofertas.

### Pendientes (críticos o importantes)

| Problema | Impacto | Dónde |
|----------|---------|--------|
| **Sin structured data (Product/Offer/AggregateRating)** | Google no puede mostrar rich results (precio, valoración) en SERP. | `/oferta/[id]` |
| **Imágenes sin next/image** | LCP y CLS peores; Google penaliza experiencia. | OfferCard, OfferModal, oferta page, categoria/tienda |
| **Sin og:image absoluta en algunas rutas** | Al compartir, redes pueden no resolver la imagen. | Verificar que `metadataBase` + rutas relativas o URLs absolutas en OG |
| **Límite 10k ofertas en sitemap** | Con >10k ofertas, no todas se incluyen; se puede usar sitemap index con varios sitemaps. | `app/sitemap.ts` |
| **Tienda por slug:** colisiones | Dos tiendas con el mismo slug (ej. “Amazon” y “Amazon MX”) comparten URL; uno puede no encontrarse. | Resolver con slug único (ej. añadir sufijo o ID en BD). |

---

## 3. Estructuras de página faltantes (vs Promodescuentos)

| Tipo de página | Promodescuentos | AVENTA ahora | Notas |
|----------------|------------------|--------------|--------|
| Oferta | `/oferta/slug-oferta` | `/oferta/[id]` (UUID) | Implementado; slug legible sería P2. |
| Categoría | `/categoria/electronica` | `/categoria/[slug]` | Implementado (macro + legacy). |
| Tienda | `/tienda/amazon` | `/tienda/[slug]` | Implementado (slug desde nombre). |
| Producto | `/producto/iphone-15` | No | Agrupa ofertas por producto; requiere definición de “producto”. |
| Comentarios como página | A veces URL fragment o propia | Solo dentro de modal/página oferta | Aceptable para beta. |
| Perfil usuario | `/u/slug` | `/u/[username]` | Implementado. |
| Comunidades | Sí | Placeholder “Próximamente” | No indexable como sección útil. |

**Conclusión:** Lo mínimo para escalar como plataforma de ofertas (oferta, categoría, tienda, home, perfiles) está cubierto. La única pieza “grande” que falta para un modelo tipo Promodescuentos es **páginas producto** (y opcionalmente slugs legibles para ofertas).

---

## 4. Enlaces internos, crawling y duplicados

### Enlaces internos

- **Home:** Enlaces a ofertas (vía cards → `/oferta/[id]`).
- **Oferta:** Enlaces a categoría, tienda, autor (`/u/[slug]`), “Inicio”.
- **Categoría:** Enlaces a ofertas, otras categorías, “Inicio”.
- **Tienda:** Enlaces a ofertas, “Inicio”.
- **Footer:** Privacy, Terms.

No hay bloqueo de crawling en estas rutas (solo en `/admin`, `/api`, `/me`, `/settings`, `/mi-panel` en robots.txt).

### Riesgos de contenido duplicado

- **Oferta en home (modal) vs oferta (página):** Resuelto con redirect `?o=id` → `/oferta/id` y canonical en la página.
- **Categoría con/sin trailing slash:** Next.js por defecto no genera duplicados; no hay trailing slash en las rutas definidas.
- **Tienda:** Si en BD hay “Amazon” y “amazon”, el slug sería el mismo; conviene normalizar o usar identificador único.

### Crawl

- **robots.txt:** Allow `/`, Disallow admin, api, auth, mi-panel, settings, me. Sitemap apuntando al dominio correcto.
- **Sitemap:** Una sola entrada en robots; el sitemap dinámico incluye las URLs importantes. Para >50k URLs considerar sitemap index.

---

## 5. Meta tags, Open Graph y canonical

| Elemento | Estado |
|----------|--------|
| **metadataBase** | Definido en layout (aventaofertas.com o env). |
| **Title/description por oferta** | generateMetadata en `/oferta/[id]`. |
| **Canonical por oferta** | `alternates.canonical` en metadata. |
| **Canonical categoría/tienda** | Definido en sus respectivas páginas. |
| **Open Graph oferta** | title, description, url, siteName, type, images (image_url). |
| **Twitter card** | summary_large_image, title, description. |
| **OG imagen** | Usar URL absoluta (ej. `new URL(offer.image_url, baseUrl).toString()` si la imagen es relativa). |

---

## 6. Structured data (JSON-LD) que deberían existir para ofertas

Para que Google muestre precios y valoración en resultados:

- **Product:** name, image, description (de la oferta).
- **Offer:** price, priceCurrency (MXN), availability, url (enlace a la tienda).
- **AggregateRating:** a partir de upvotes/downvotes (por ejemplo, valoración derivada del score).

**Estado:** No implementado. Incluido en roadmap P1.

**Ejemplo de implementación (idea):** En `app/oferta/[id]/page.tsx` o en un componente que renderice el `<head>`, añadir un `<script type="application/ld+json">` con el JSON-LD. Incluir `@context`, `@type`, y los campos mínimos de Product, Offer y opcionalmente AggregateRating.

---

## 7. Rendimiento y SEO (LCP, hidratación, imágenes, caché)

| Área | Estado | Recomendación |
|------|--------|----------------|
| **LCP** | Imágenes con `<img>` sin optimizar en cards y modal. | Usar `next/image` en OfferCard, OfferModal y página de oferta. |
| **Hidratación** | Client components en feed y modales; no hay streaming crítico. | Aceptable; priorizar imágenes y above-the-fold. |
| **Lazy loading** | No explícito en listas largas. | next/image hace lazy por defecto; listas muy largas podrían virtualizarse (P2). |
| **Imágenes** | Sin redimensionado ni formatos modernos. | next/image con sizes y priority en hero. |
| **Caché** | Fetch en cliente sin capa de caché (React Query/SWR). | P2: caché en cliente para feed; revalidación en sitemap ya es por generación en cada request. |

---

## 8. robots.txt, sitemap, rutas no indexables

- **robots.txt:** Correcto (Allow /, Disallow admin, api, auth, mi-panel, settings, me). Sitemap: aventaofertas.com/sitemap.xml (comprobar dominio en producción).
- **sitemap.xml:** Dinámico; incluye home, estáticas, categorías, tiendas, ofertas aprobadas no expiradas.
- **Rutas no indexables (por diseño):** /admin/*, /me, /settings, /mi-panel, /api/*, /auth/*. No aparecen en sitemap y están en Disallow.

---

## 9. Estructura de crecimiento (deal community)

| Elemento | ¿Existe? | Comentario |
|----------|----------|------------|
| Páginas de oferta | Sí | `/oferta/[id]`. |
| Páginas de tienda | Sí | `/tienda/[slug]`. |
| Páginas de categoría | Sí | `/categoria/[slug]`. |
| Páginas de producto | No | Agrupar por producto; P2. |
| Votación en ofertas | Sí | API y UI. |
| Comentarios | Sí | En oferta (modal/página). |
| Perfiles de usuario | Sí | `/u/[username]`. |
| Comunidades | No (placeholder) | “Próximamente”; no es una sección indexable útil aún. |

---

## 10. Roadmap priorizado

### P0 — Crítico antes de lanzar (SEO/arquitectura)

- [x] **URL canónica por oferta** (`/oferta/[id]`) y redirección `?o=id` → `/oferta/id`.
- [x] **Sitemap dinámico** con ofertas (aprobadas, no expiradas), categorías y tiendas.
- [x] **Canonical y OG por oferta** (y por categoría/tienda).
- [x] **Enlaces de compartir** usando `/oferta/[id]`.
- [x] **Páginas categoría y tienda** con listados y enlaces internos.

### P1 — Mejoras importantes para crecimiento

- [ ] **Structured data (JSON-LD)** en `/oferta/[id]`: Product, Offer, AggregateRating.
- [ ] **next/image** en OfferCard, OfferModal y página de oferta (mejorar LCP).
- [ ] **og:image absoluta** en todas las páginas con imagen (oferta, categoría si hay imagen por defecto).
- [ ] **Sitemap index** si se superan ~50k URLs (varios sitemaps por tipo: ofertas, tiendas, etc.).
- [ ] **Normalización de tienda** para evitar colisiones de slug (ej. slug único en BD o sufijo).

### P2 — Escalado futuro

- [ ] **Páginas producto** `/producto/[slug]` (definir modelo: extracción de producto desde título o etiquetas).
- [ ] **Slug legible para ofertas** (ej. `/oferta/iphone-15-pro-amazon`) con redirect desde `/oferta/[id]` si se quiere mantener UUID.
- [ ] **Caché en cliente** para feed (React Query/SWR) y revalidación.
- [ ] **Virtualización** de listas muy largas en categoría/tienda si hace falta.

---

## 11. Plan de implementación (archivos creados/modificados)

### Archivos creados

| Archivo | Propósito |
|---------|-----------|
| `lib/slug.ts` | `slugifyStore`, `storeSlugToName` para URLs de tienda. |
| `app/oferta/[id]/page.tsx` | Página servidor de oferta: fetch, metadata, canonical, OG. |
| `app/oferta/[id]/OfferPageContent.tsx` | Cliente: detalle oferta, votos, enlaces categoría/tienda, CTA, modal comentarios. |
| `app/categoria/[slug]/page.tsx` | Página servidor listado por categoría; metadata y canonical. |
| `app/categoria/[slug]/CategoriaOfferList.tsx` | Cliente: lista de OfferCard con navegación a `/oferta/[id]`. |
| `app/tienda/[slug]/page.tsx` | Página servidor listado por tienda; resolución slug → nombre. |
| `app/tienda/[slug]/TiendaOfferList.tsx` | Cliente: lista de OfferCard con navegación a `/oferta/[id]`. |
| `docs/SEO_AUDIT_AND_ARCHITECTURE.md` | Este informe. |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `middleware.ts` | Redirect 301 `/?o=id` → `/oferta/id`; matcher incluye `/`. |
| `app/sitemap.ts` | Sitemap dinámico: estáticas, categorías, tiendas, ofertas desde Supabase. |
| `app/components/OfferCard.tsx` | URL de compartir: `/?o=id` → `/oferta/id`. |
| `app/components/OfferModal.tsx` | URL de compartir: `/?o=id` → `/oferta/id`. |
| `app/page.tsx` | Click en card: navegación a `/oferta/[id]` en lugar de abrir modal con `?o=`. |

### Rutas añadidas

- `GET /oferta/[id]` — Página de oferta (SSR).
- `GET /categoria/[slug]` — Listado por categoría (SSR).
- `GET /tienda/[slug]` — Listado por tienda (SSR).

### Cambios en base de datos

- **Ninguno** para la implementación actual. Las tablas `offers` (con `category`, `store`, `status`, `expires_at`) y la vista `ofertas_ranked_general` son suficientes.
- **Opcional (P2):** Campo `slug` en ofertas o tabla `products` para páginas producto.

---

## 12. Resumen ejecutivo

- **Implementado:** Arquitectura SEO base: URL canónica por oferta (`/oferta/[id]`), redirección desde `?o=id`, páginas de categoría y tienda, sitemap dinámico, canonical y OG por página, enlaces internos oferta ↔ categoría/tienda, y enlaces de compartir canónicos.
- **Pendiente para mayor impacto:** Structured data (JSON-LD) en ofertas, optimización de imágenes con `next/image`, y (a medio plazo) páginas producto y/o slugs legibles para ofertas.
- **Estado:** Listo para indexación masiva de ofertas, categorías y tiendas; P1 (structured data, next/image, OG absoluta, sitemap escalable) implementado.

---

## 13. P1 implementado — Checklist de verificación

### Structured data (JSON-LD)
- [x] Product: name, image, description en `/oferta/[id]`.
- [x] Offer: url (canonical), price, priceCurrency MXN, availability InStock, seller (store).
- [x] AggregateRating: ratingValue (derivado de up/total), ratingCount (up+down), bestRating 5, worstRating 1.
- [x] Script `application/ld+json` en el server component de la oferta.

### next/image
- [x] OfferCard: imagen principal con `fill`, `sizes`, lazy por defecto.
- [x] OfferModal: imagen desktop y móvil con `fill`, `sizes`, `unoptimized` para rutas relativas.
- [x] OfferPageContent: imagen principal con `priority`, `fill`, `sizes`.
- [x] next.config: `remotePatterns` para Supabase (host desde env), placehold.co, lh3.googleusercontent.com, aventaofertas.com.

### Open Graph
- [x] og:image con URL absoluta: `image_url.startsWith('http') ? image_url : new URL(image_url, BASE_URL).toString()`.

### Sitemap escalable
- [x] `lib/sitemap.ts`: `getSitemapStatic()`, `getSitemapCategories()`, `getSitemapStores()`, `getSitemapOffers(limit, offset)`, `getOffersCount()`, constantes `SITEMAP_INDEX_THRESHOLD` y `OFFERS_PAGE_SIZE`.
- [x] `app/sitemap.ts` usa helpers; preparado para futuro sitemap index (`/sitemaps/offers-1.xml`, etc.).

### Verificación post-implementación
- [ ] Structured data: revisar en `/oferta/[id]` con "View Page Source" o extensión Schema.org.
- [ ] Sin errores de hidratación en consola.
- [ ] Páginas de oferta siguen siendo server-rendered (comprobar en Network que el HTML incluye contenido).
- [ ] Canonical correcto en head de `/oferta/[id]`.
- [ ] `/sitemap.xml` responde y lista ofertas, categorías, tiendas.
- [ ] Imágenes no rompen layout en móvil y desktop (OfferCard, modal, página oferta).
