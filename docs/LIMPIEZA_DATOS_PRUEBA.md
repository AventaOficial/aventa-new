# Limpieza de datos de prueba (ofertas y métricas)

Objetivo: dejar la base como **día 0** en ofertas y métricas, **sin tocar** perfiles, reputación, roles ni configuración.

---

## 1. Qué se borra

| Tabla | Contenido |
|-------|-----------|
| `comment_likes` | Likes en comentarios |
| `comments` | Comentarios de ofertas |
| `offer_votes` | Votos (up/down) por oferta |
| `offer_favorites` | Favoritos por usuario/oferta |
| `offer_events` | Eventos vista/outbound/share (métricas) |
| `offer_reports` | Reportes de ofertas |
| `moderation_logs` | Historial de aprobar/rechazar ofertas |
| `offers` | Ofertas |

## 2. Qué NO se borra

- **profiles** (usuarios, display_name, avatar, reputation_score, reputation_level, slug, etc.)
- **user_roles** (owner, admin, moderator, analyst)
- Triggers y funciones (reputación, ranking, etc.)
- Vistas (`ofertas_ranked_general`, etc.)
- RLS y políticas
- **user_bans** (baneos)
- Cualquier otra tabla que no dependa de ofertas

---

## 3. Antes de ejecutar: backup

1. En **Supabase Dashboard** → **Table Editor**:
   - Tabla **offers** → … → **Export as CSV** (guardar como `backup_offers_YYYYMMDD.csv`).
   - Tabla **offer_events** → … → **Export as CSV** (guardar como `backup_offer_events_YYYYMMDD.csv`).
2. Opcional: exportar también `offer_votes`, `comments`, `offer_reports` si quieres trazabilidad completa.

O con **pg_dump** (si tienes acceso por CLI):

```bash
pg_dump -h <host> -U postgres -t public.offers -t public.offer_events --data-only -f backup_offers_events.sql
```

---

## 4. Cómo ejecutar la limpieza

1. Abre **Supabase Dashboard** del proyecto → **SQL Editor**.
2. Copia y pega el contenido de **`docs/supabase-migrations/clean_offers_and_metrics_data.sql`**.
3. Revisa que estás en el proyecto correcto.
4. Ejecuta el script (**Run**).

No hace falta tocar código ni redesplegar la app: la app seguirá funcionando; el feed y las métricas quedarán vacíos hasta que se vuelvan a crear ofertas.

---

## 5. Después de la limpieza

- El **feed** estará vacío (0 ofertas).
- **Ranking y métricas** sin datos de prueba; cuando haya ofertas reales, `ranking_blend` y reputación se calcularán limpios.
- **Perfiles y niveles** se mantienen; los usuarios pueden seguir entrando y publicando cuando quieras abrir de nuevo.

Si algo falla por FK (p. ej. una tabla que no esté en el script y referencie `offers`), el error de Supabase indicará la tabla; se puede añadir un `DELETE FROM esa_tabla` antes de `DELETE FROM public.offers` en el script.
