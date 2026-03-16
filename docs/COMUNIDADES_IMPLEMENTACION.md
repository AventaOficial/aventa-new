# Comunidades — Implementación actual (próximamente)

Documento que describe lo que ya está implementado para el sistema de Comunidades. En la UI, el atajo "Comunidades" aparece como **Comunidades (próximamente)** hasta que se decida desarrollar y promocionar la funcionalidad.

---

## 1. Base de datos (Supabase)

Ya aplicado por ti en Supabase:

- **Tabla `communities`**
  - `id` (uuid, PK), `name` (text), `slug` (text, unique), `description` (text), `icon` (text, nullable), `created_at` (timestamptz).
  - Fila inicial: nombre "Equipo Aventa", slug "equipo-aventa", descripción "Comunidad oficial del proyecto Aventa".

- **Tabla `community_offers`**
  - `id` (uuid), `community_id` (FK → communities.id), `offer_id` (FK → offers.id), `created_at`.
  - Relación N:N entre comunidades y ofertas.

---

## 2. Backend

- **Crear oferta con comunidad (opcional)**  
  - `POST /api/offers` acepta en el body un campo opcional `community_id` (string, UUID).  
  - Si viene y la oferta se crea bien, se inserta una fila en `community_offers` vinculando esa oferta a esa comunidad.  
  - Si falla la inserción en `community_offers`, la oferta sigue creada (no se bloquea el flujo).  
  - Archivo: `app/api/offers/route.ts`.

---

## 3. Páginas

- **`/communities`** (`app/communities/page.tsx`)  
  - Listado de comunidades (por ahora solo "Equipo Aventa").  
  - Hero "Comunidades" + subtítulo.  
  - Card con nombre, descripción y botón "Ver comunidad" que lleva a `/communities/equipo-aventa`.  
  - Estilo glassmorphism (gradiente + orbes).  
  - Página cliente envuelta en `<Suspense>` por requisitos de Next 16.

- **`/communities/[slug]`** (`app/communities/[slug]/page.tsx`)  
  - Detalle de una comunidad por `slug`.  
  - Carga la comunidad desde `communities`, luego los `offer_id` desde `community_offers`, y las ofertas desde la vista `ofertas_ranked_general` (mismos filtros de estado/expiración que el feed).  
  - Muestra las ofertas con el mismo `OfferCard` que el resto del sitio.  
  - Componente cliente de lista: `app/communities/CommunitiesOfferList.tsx`.

---

## 4. Navegación

- **Sidebar desktop (ActionBar)**  
  - En "Tus atajos" hay un ítem que apunta a `/communities`.  
  - En la UI se muestra como **"Comunidades (próximamente)"** (estilo gris, sin estado activo) para indicar que la funcionalidad aún no se promociona.  
  - La ruta y las páginas siguen existiendo; no se ha borrado nada.

---

## 5. Resumen

| Elemento | Estado |
|----------|--------|
| Tablas `communities` y `community_offers` | Creadas en Supabase |
| `POST /api/offers` con `community_id` opcional | Implementado |
| Página `/communities` | Implementada (lista + card Equipo Aventa) |
| Página `/communities/[slug]` | Implementada (ofertas de la comunidad) |
| Atajo en sidebar | Visible como "Comunidades (próximamente)" |

Cuando quieras activar la funcionalidad para usuarios, basta con cambiar en `ActionBar` el texto y el estilo del atajo (quitar "(próximamente)" y darle el mismo estilo activo que Inicio/Favoritos). El resto ya está listo.
