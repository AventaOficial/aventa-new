# Fase 2 — Comunidad (solicitudes + debates)

**Estado:** no implementado. Documento de referencia para después del lanzamiento cuando el core (feed, votos, moderación) esté estable.

## Principio

- **Aventa = ofertas.** La comunidad existe para **generar más ofertas y engagement**, no para competir con el home.
- **Navbar:** no reemplazar “Descubre” por “Solicitar” en el lanzamiento; confunde el modelo mental. Cuando exista el módulo, agrupar bajo **“Comunidad”** (o evolucionar `/descubre` como hub) con feed mixto interno.

## MVP sugerido (orden)

1. Crear **solicitud** (título, presupuesto opcional, tienda preferida opcional).
2. **Feed** de solicitudes (moderación `pending` → `approved` como ofertas).
3. **Responder** (texto; fase 2b: enlace a `offer_id` creado).
4. **Debates** después, como complemento de baja prioridad.

## Modelo de datos (borrador)

- `community_items`: `id`, `type` (`request` | `discussion`), `author_id`, `body` / JSON, `status`, `created_at`, `engagement_score` (fase 2+).
- `request_meta` (o columnas JSON): `budget_max`, `preferred_store`, `expires_at`, `fulfilled_at`.
- `request_responses`: `request_id`, `user_id`, `comment`, `offer_id` (nullable).

## Moderación

- Misma filosofía que ofertas: cola admin filtrable por tipo.
- Auto-aprobación opcional por `reputation_level` (como comentarios).

## Lo que no recomendamos en MVP

- Filtros por “público femenino/masculino” (no verificable, riesgo de producto/legal).
- Demasiados tipos de contenido o feeds separados que fragmenten el producto.

## Enlace con el core

Respuesta a solicitud → usuario sube oferta → entra al feed normal = crecimiento orgánico.
