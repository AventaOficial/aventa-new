# Acciones Supabase — prioridad inmediata

## Decisión: status = approved

**Usar `approved`** — encaja con el flujo de moderación (pending → approved/rejected). La BD ya está migrada.

---

## Lo que ya hice en el código

### Status unificado (app)
- La app ahora acepta **ambos** `approved` y `published` en todas las consultas del feed.
- Así funciona aunque la BD use uno u otro durante la transición.
- Archivos tocados: `page.tsx`, `api/profile/[username]/route.ts`, `admin/metrics/page.tsx`, `admin/moderation/page.tsx`.

---

## Lo que debes pedir a la IA de Supabase (en orden)

### 1. Unificar status en la BD (prioridad alta)
```
Ejecuta: 
- UPDATE public.offers SET status = 'approved' WHERE status = 'published';
- ALTER TABLE public.offers ALTER COLUMN status SET DEFAULT 'approved';
```
*(O si prefieres usar 'published' en todo el flujo, dime y ajusto la app.)*

### 2. Políticas RLS básicas (prioridad alta)
```
Crear políticas RLS en:
- offers: anon SELECT solo status aprobado y no expirado; authenticated SELECT + propias; INSERT created_by=auth.uid(); UPDATE owner o moderator
- offer_votes, offer_favorites, comments, offer_events: políticas según user_id
```

### 3. Helper is_moderator() y políticas (prioridad alta)
```
Crear función is_moderator() SECURITY DEFINER que consulte user_roles.
Usarla en las políticas de UPDATE de offers para moderadores.
```

### 4. Confirmar vistas (prioridad media)
```
¿Existen public.ofertas_ranked_general y public.public_profiles_view?
Si no: crear public_profiles_view con COALESCE(display_name, username).
La app las usa para el feed.
```

### 5. event_type en offer_events (prioridad baja)
```
Actualmente la app solo envía 'view' y 'outbound'. 
Si en el futuro quieres 'created' o 'moderated', añadir al check constraint.
No urgente.
```

---

## Lo que NO toqué

- Migraciones SQL (las ejecutas tú con la IA de Supabase)
- Triggers `recalculate_offer_metrics` (la migración 017 ya los crea)
- `handle_new_user` (la migración 001 ya lo crea)
- Bucket `offer_images` (verificar manualmente en Supabase Dashboard)
