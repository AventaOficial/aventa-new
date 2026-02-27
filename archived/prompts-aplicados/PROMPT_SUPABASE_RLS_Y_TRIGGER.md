# Prompt para Supabase — Ajustes RLS y Trigger

Copia y pega este prompt en el chat de Supabase para aplicar las opciones **A** y **B** recomendadas.

---

## Contexto

AVENTA tiene las tablas `moderation_logs`, `offer_reports` y el trigger `trg_compute_risk_score` en `offers`. Se requieren estos ajustes:

1. **A) RLS:** Restringir políticas de `moderation_logs` y `offer_reports` a roles concretos (owner, admin, moderator).
2. **B) Trigger:** Cambiar el trigger de risk_score de AFTER INSERT a BEFORE INSERT para evitar doble write.

---

## Tareas a ejecutar

### A) Políticas RLS restrictivas

Crear una función helper que devuelva si el usuario actual tiene rol de moderación:

```sql
-- Función helper: ¿el usuario tiene rol owner/admin/moderator?
CREATE OR REPLACE FUNCTION public.user_has_moderation_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'admin', 'moderator')
  );
$$;
```

Actualizar políticas de `moderation_logs`:

```sql
-- Eliminar políticas abiertas
DROP POLICY IF EXISTS "Admin puede leer logs" ON public.moderation_logs;
DROP POLICY IF EXISTS "Admin puede insertar logs" ON public.moderation_logs;

-- Solo usuarios con rol owner/admin/moderator pueden leer
CREATE POLICY "Moderadores pueden leer logs" ON public.moderation_logs
  FOR SELECT USING (public.user_has_moderation_role());

-- Solo usuarios con rol owner/admin/moderator pueden insertar (vía API con service_role se inserta igual)
CREATE POLICY "Moderadores pueden insertar logs" ON public.moderation_logs
  FOR INSERT WITH CHECK (public.user_has_moderation_role());
```

Actualizar políticas de `offer_reports`:

```sql
-- SELECT: solo moderadores
DROP POLICY IF EXISTS "Moderadores pueden ver reportes" ON public.offer_reports;
CREATE POLICY "Moderadores pueden ver reportes" ON public.offer_reports
  FOR SELECT USING (public.user_has_moderation_role());

-- INSERT ya está restringido a reporter_id = auth.uid()
```

### B) Trigger BEFORE INSERT para risk_score

El trigger actual hace un UPDATE dentro de AFTER INSERT (doble write). Cambiar a BEFORE INSERT:

```sql
-- Eliminar trigger actual
DROP TRIGGER IF EXISTS trg_compute_risk_score ON public.offers;

-- Nueva función: calcular risk_score en BEFORE INSERT
-- Nota: en BEFORE INSERT aún no existe el id, así que usamos NEW directamente
CREATE OR REPLACE FUNCTION public.trigger_compute_risk_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  score integer := 0;
  similar_count integer;
  user_offers_count integer;
BEGIN
  IF NEW.status != 'pending' THEN RETURN NEW; END IF;

  -- Factor 1: títulos con substring común
  IF length(NEW.title) >= 10 THEN
    SELECT COUNT(*)::int INTO similar_count
    FROM public.offers o2
    WHERE o2.created_at >= now() - interval '7 days'
      AND (o2.status = 'approved' OR o2.status = 'published')
      AND length(o2.title) >= 10
      AND (o2.title ILIKE '%' || left(trim(NEW.title), 15) || '%' OR NEW.title ILIKE '%' || left(trim(o2.title), 15) || '%');
  ELSE
    similar_count := 0;
  END IF;
  IF similar_count > 0 THEN score := score + 15; END IF;
  IF similar_count > 2 THEN score := score + 20; END IF;

  -- Factor 2: precio original <= precio actual
  IF NEW.original_price IS NOT NULL AND NEW.original_price <= NEW.price THEN
    score := score + 30;
  END IF;

  -- Factor 3: usuario con muchas ofertas en 24h
  IF NEW.created_by IS NOT NULL THEN
    SELECT COUNT(*)::int INTO user_offers_count
    FROM public.offers o3
    WHERE o3.created_by = NEW.created_by
      AND o3.created_at >= now() - interval '24 hours';
    IF user_offers_count > 5 THEN score := score + 35; END IF;
  END IF;

  NEW.risk_score := LEAST(100, score);
  RETURN NEW;
END;
$$;

-- Trigger BEFORE INSERT (una sola write)
CREATE TRIGGER trg_compute_risk_score
  BEFORE INSERT ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_compute_risk_score();
```

**Importante:** En BEFORE INSERT la fila aún no existe en la tabla, por eso no podemos usar `compute_offer_risk_score(NEW.id)`. La lógica se movió inline al trigger. La función `compute_offer_risk_score` puede quedar para uso manual (ej. recalcular ofertas existentes).

---

## Orden de ejecución

1. Crear `user_has_moderation_role()`
2. Actualizar políticas de `moderation_logs`
3. Actualizar políticas de `offer_reports`
4. Eliminar trigger `trg_compute_risk_score`
5. Crear nueva función `trigger_compute_risk_score` (BEFORE INSERT)
6. Crear nuevo trigger

---

## Migraciones adicionales (Cursor)

Si Cursor añadió migraciones 027 y 028 (share en offer_events, shares en offer_performance_metrics), ejecutarlas antes si aún no están aplicadas.
