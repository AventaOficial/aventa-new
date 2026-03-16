# SYSTEM — Perfiles

## Architecture

- **Público:** app/oferta/[id], app/profile/[username]. Datos de perfil desde public_profiles_view (display_name, avatar_url, leader_badge, ml_tracking_tag). API GET /api/profile/[username] para datos de perfil público.
- **Usuario actual:** /api/me (sesión), /api/me/preferred-categories, /api/sync-profile (actualizar display_name, avatar desde OAuth).
- **Reputación:** lib/server/reputation.ts; usada en upload (auto-aprobar si ≥ 3) y en ranking (reputation_weighted_score).

## Data flow

1. Ver perfil ajeno → GET /api/profile/[username] o lectura de public_profiles_view en ofertas/comentarios.
2. Ajustes de cuenta → Settings usa /api/me, /api/me/preferred-categories, /api/sync-profile.
3. Contadores (ofertas subidas, etc.) vía RPC o columnas en profiles.

## Database usage

- **profiles** / **public_profiles_view:** id, username, display_name, avatar_url, leader_badge, ml_tracking_tag, reputación (si existe).
- **preferred_categories:** tabla o JSON en profiles para feed “Para ti”.

## Edge cases

- **Username no encontrado:** 404 en página perfil.
- **Sync después de OAuth:** sync-profile actualiza display_name y avatar si cambian en proveedor.
