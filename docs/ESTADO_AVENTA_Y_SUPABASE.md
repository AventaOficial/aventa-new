# Estado AVENTA y acciones Supabase

**Fecha:** Febrero 2025

---

## 1. Situación actual

- **Ofertas:** Se suben correctamente; feed, votos, favoritos y moderación funcionan.
- **Autor "Usuario":** Los usuarios de Google quedaban con `display_name` vacío porque Google envía `full_name`/`name`, no `display_name`.  
  **Hecho:** Trigger de perfil actualizado (migración 035) para usar `full_name` y `name`; sincronización en cliente (Navbar) para perfiles ya creados.
- **Votos (+2 / -1):** El score ya está implementado en backend: migración 021 y vista `ofertas_ranked_general` usan `score = (upvotes * 2) - downvotes`. La card y el modal muestran ese `score` si la vista se usa correctamente.
- **Comentarios y moderación:** Los comentarios pasan a estado `pending`; solo se muestran los `approved`. Migración 036 añade `status` y políticas RLS; la API filtra por `status = 'approved'`. Al publicar un comentario se muestra el mensaje: "Será visible cuando pase la moderación." Falta UI en admin para aprobar/rechazar comentarios (lista por oferta o global).
- **Formulario oferta:** Añadidos MSI (meses sin intereses) con selector 3/6/12/18/24 y cálculo por mes, y soporte para varias imágenes (subida una a una; se envían `image_url` + `image_urls`). Migración 037 añade `msi_months` e `image_urls` en `offers` y actualiza la vista.
- **OfferModal:** Ajuste de layout: imagen más baja en móvil, zona de contenido con `min-height` para dar más espacio a comentarios y menos sensación de “apretado”.

---

## 2. Porcentaje aproximado del proyecto AVENTA

| Área | Estado | % aprox. |
|------|--------|----------|
| Auth (Google OAuth, sesión, logout) | Operativo | 100% |
| Ofertas (crear, listar, moderar, métricas) | Operativo | 100% |
| Votos (score +2/-1, trigger, vista) | Operativo | 100% |
| Favoritos | Operativo | 100% |
| Comentarios (crear, listar, moderación por status) | Backend listo; falta UI admin para aprobar/rechazar | 85% |
| Reportes (crear, listar en admin) | Operativo | 100% |
| Perfiles (display_name desde Google, reputación) | Trigger + sync cliente; RPCs reputación | 95% |
| Form oferta (múltiples imágenes, MSI) | Implementado (migración 037 + form + API) | 100% |
| UI/UX (modal, feed, PWA, onboarding) | Ajustes hechos | 95% |
| Seguridad (RLS, políticas, service_role solo servidor) | 034 aplicada; pendientes puntos del informe Supabase | 90% |

**Global estimado:** ~95%. Lo que falta: panel admin para moderar comentarios (aprobar/rechazar por status) y aplicar en Supabase las correcciones críticas del informe (políticas, vistas SECURITY DEFINER, search_path).

---

## 3. Acciones recomendadas a partir del informe Supabase

Resumen de lo que indica el informe que te pasaron y cómo alinearlo con el repo:

### Crítico

1. **Política INSERT en `offer_events`:**  
   En el repo, la migración 034 restringe INSERT a `authenticated`. Si en tu proyecto sigue existiendo una política con `WITH CHECK (true)` para anónimos, reemplázala por una que exija `authenticated` y, si quieres, que valide `offer_id` en `offers` y `event_type` en ('view','outbound','share'). Asegúrate de tener aplicada la 034.

2. **Vistas con SECURITY DEFINER:**  
   Revisar en Supabase qué vistas están con SECURITY DEFINER (`ofertas_ranked_general`, `public_profiles_view`, etc.). Si deben respetar RLS, cambiarlas a SECURITY INVOKER o documentar por qué necesitan DEFINER.

3. **search_path en funciones:**  
   En funciones usadas por RLS o triggers (p. ej. `is_moderator`, `user_has_moderation_role`), definir `SET search_path = public` (o el esquema que corresponda) para evitar riesgos.

4. **Revocaciones:**  
   Confirmar que las funciones SECURITY DEFINER que solo debe usar el backend tengan `REVOKE EXECUTE ... FROM anon, authenticated` (en el repo ya está en 033 para los RPCs de reputación).

5. **Service role key:**  
   Verificar que no esté en cliente ni en bundles públicos (solo en variables de servidor en Vercel).

### Alto

6. **Migraciones y vistas:**  
   Tener versionadas en el repo todas las vistas y funciones que existan en la BD (incluidas 035, 036, 037). Eliminar o documentar objetos `_backup` si ya no se usan.

7. **Índices:**  
   Revisar que existan índices como `offer_events(offer_id, created_at)`, `offers(status, expires_at)`, `user_roles(user_id)` (034 y otras migraciones ya añaden varios).

8. **Políticas en `user_roles`:**  
   Evitar que clientes autenticados puedan INSERT/UPDATE; dejar gestión de roles solo al backend con service_role.

### Medio / Bajo

9. **Retención de `offer_events`:**  
   Definir retención (p. ej. 90 días) o partición por fecha si el volumen crece.

10. **Extensiones:**  
    Revisar extensiones instaladas y desactivar o documentar las que no se usen.

---

## 4. Migraciones nuevas en este repo (a aplicar en Supabase)

- **035_profiles_google_display_name.sql** – Trigger `handle_new_user` usa `full_name` y `name` de Google.
- **036_comments_status_moderation.sql** – Columna `status` en `comments`, políticas para solo mostrar `approved` y que moderadores vean/actualicen.
- **037_offers_msi_and_image_urls.sql** – Columnas `msi_months` e `image_urls` en `offers` y actualización de la vista `ofertas_ranked_general`.

Aplicar en orden (035 → 036 → 037) en el SQL Editor o con `supabase db push` si usas CLI.

---

## 5. Cómo comprobar que todo se guarda bien

- **Perfil/nombre:** Iniciar sesión con Google; en Navbar debe verse el nombre (si ya existía perfil vacío, se rellena con la sincronización). En /settings se puede editar `display_name`.
- **Votos:** El score en la vista es `up*2 - down`. Comprobar en la tabla `offers` que `upvotes_count`/`downvotes_count` se actualizan con el trigger y que el feed usa la vista con `score`.
- **Comentarios:** Crear comentario → en `comments` debe aparecer con `status = 'pending'`. Solo aparecerán en la app los que tengan `status = 'approved'` (por ahora hay que actualizarlos a mano en Table Editor o implementar UI de moderación).
- **Oferta con MSI e imágenes:** Tras aplicar 037, subir oferta con MSI y varias imágenes; en `offers` deben guardarse `msi_months` e `image_urls`.

Cuando todo lo anterior esté aplicado y revisado, el estado del producto y de la BD quedan alineados con este documento.
