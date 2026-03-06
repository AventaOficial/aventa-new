# Refactor del modal de ofertas y error 400 en el feed

## Qué se hizo en el refactor de ofertas

- **Home (`/`):** Se dejó de usar el modal de oferta. Antes, al hacer clic en una card se abría `OfferModal` y la URL podía llevar `?o=id`. Ahora, al hacer clic en una card se navega a la **página canónica** `/oferta/[id]`. El middleware redirige `/?o=id` → `/oferta/id`. La única vista “completa” de una oferta es `/oferta/[id]`.
- **Modal:** El componente `OfferModal` **sigue existiendo** y se usa en:
  - **`/me`** (Mis ofertas): al hacer clic en una oferta se abre el modal (vista resumida, sin comentarios cargados desde la API).
  - **`/u/[username]`** (Perfil público): igual, clic en una card abre el modal.
  - **`/me/favorites`** (Favoritos): igual, clic en una card abre el modal.

No es un bug que el modal siga en esas rutas: es intencional para no sacar al usuario de “mis ofertas” o del perfil. Si quieres que en esas páginas también se vaya a `/oferta/[id]` en lugar del modal, se puede cambiar el `onCardClick` para que haga `router.push('/oferta/' + offer.id)` y se puede dejar de renderizar `OfferModal` ahí.

---

## Error 400 en `ofertas_ranked_general`

El navegador muestra algo como:

`GET .../ofertas_ranked_general?select=...&order=ranking_blend.desc&or=(status...)&or=(expires_at...)&created_at=gte....&category=in.(electronics,home,fashion)&limit=60` → **400 (Bad Request)**.

### Posibles causas

1. **Vista o columnas en Supabase**
   - La vista `public.ofertas_ranked_general` no existe en tu proyecto, o no tiene las columnas que usa el cliente (`category`, `status`, `expires_at`, `ranking_blend`, etc.).
   - Asegúrate de tener aplicadas las migraciones:
     - `docs/supabase-migrations/offers_category.sql` (columna `category` en `offers`).
     - `docs/supabase-migrations/view_ranking_blend.sql` (vista con `category`, `status`, `expires_at`, `score_final`, `ranking_blend`, etc.).
   - En el SQL Editor de Supabase puedes comprobar:  
     `SELECT * FROM ofertas_ranked_general LIMIT 1;`

2. **Vista de perfiles y relación**
   - El `select` hace un embed:  
     `profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag)`.
   - Si `public_profiles_view` no existe o no tiene `leader_badge` / `ml_tracking_tag`, o si PostgREST no puede resolver la relación con la vista, puede responder 400.
   - Migración relevante: `docs/supabase-migrations/public_profiles_view_leader_ml.sql`.

3. **Filtros**
   - En “Día a día” (vitales) se aplica `category=in.(electronics,home,fashion,...)`. Si en tu BD la columna `offers.category` no existe o tiene otros valores, la query puede fallar.

### Qué hacer

- En la consola del navegador ahora se hace **log del error** cuando falla el feed:  
  `[feed] ofertas_ranked_general error: <message> <details> <hint>`.  
  Revisa ese mensaje; suele indicar columna inexistente o problema de permisos/relación.
- Comprueba en Supabase:
  - Que existan las vistas `ofertas_ranked_general` y `public_profiles_view` con las columnas que usa el código.
  - Que RLS (si está activo) permita `SELECT` para `anon`/`authenticated` sobre esas vistas (o sobre `offers` si la vista las usa).

---

## WebSocket “closed before the connection is established”

Ese mensaje suele aparecer cuando:

- Se usa **Supabase Realtime** (por ejemplo en `useOffersRealtime`) y el componente se desmonta o la ruta cambia antes de que el WebSocket termine de abrirse.
- No indica que la app esté rota: el canal se cierra al desmontar. Si quieres reducir el ruido en consola, se puede desconectar Realtime al salir de la página o usar un flag para no suscribirse si el montaje es muy breve.

---

## Resumen

| Tema | Estado |
|------|--------|
| Refactor home | Hecho: home sin modal; clic en card → `/oferta/[id]`. |
| Uso del modal | Sigue en `/me`, `/u/[username]` y `/me/favorites`. |
| 400 en feed | Revisar vista y columnas en Supabase; ver mensaje en consola `[feed] ofertas_ranked_general error: ...`. |
| WebSocket | Comportamiento esperado al desmontar; opcional afinar desconexión para evitar el aviso. |
