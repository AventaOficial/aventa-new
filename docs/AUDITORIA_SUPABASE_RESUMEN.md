# Resumen auditoría Supabase — AVENTA

Resultado de la auditoría técnica y de seguridad aplicada al proyecto. Se creó la migración `034_audit_rls_hardening.sql` para endurecer RLS e índices.

## Problemas detectados (por severidad)

### Alta (corregidos en 034)
- **offer_votes**: Políticas contradictorias o lectura pública de votos → Solo `authenticated` puede ver su propio voto (o admin/owner).
- **offer_events**: INSERT con `WITH CHECK (true)` permitía anónimos → Solo `authenticated` puede insertar (la API sigue usando `service_role` y no se ve afectada).
- **comments**: Lectura pública sin filtrar por oferta visible → SELECT solo para comentarios de ofertas `approved`/`published` y no expiradas.
- **offer_reports**: "Moderadores pueden ver reportes" tenía `USING (true)` → Solo roles moderator/admin/owner pueden SELECT.
- **moderation_logs**: "Admin puede leer/insertar logs" con `true` → Solo moderator/admin/owner pueden SELECT e INSERT.

### Media (corregidos en 034)
- **offers**: Política authenticated más explícita (solo ofertas visibles o propias o rol admin).
- **Índices**: Añadidos índices compuestos para listados y ranking (offers, offer_votes, comments, offer_events, moderation_logs).

### Baja (pendiente o opcional)
- **Retención de offer_events**: Valorar partición por fecha o job que archive/borre filas > 90 días.
- **Funciones SECURITY DEFINER**: Ya revocadas en `033_indexes_and_revokes.sql`; revisar que `user_has_moderation_role()` / `is_moderator()` estén bien implementadas si se usan en otras políticas.

## Qué hace la migración 034

1. **offer_votes**: Elimina políticas de lectura pública; crea `offer_votes_select_own_or_admin` (solo propio voto o rol admin/owner).
2. **offer_events**: Sustituye "Allow insert for analytics" por `offer_events_insert_authenticated` (solo authenticated). La API sigue insertando con service_role.
3. **comments**: Sustituye "Cualquiera puede leer comentarios" por `comments_select_on_offer_visibility` (solo ofertas visibles).
4. **offer_reports**: Sustituye "Moderadores pueden ver reportes" por `offer_reports_select_moderators` (solo user_roles moderator/admin/owner).
5. **moderation_logs**: Sustituye las dos políticas de admin por políticas que exigen rol en `user_roles` (moderator/admin/owner).
6. **offers**: Elimina `authenticated_can_select_offers_moderation` si existe y crea `offers_select_authenticated` (ofertas visibles, propias o rol admin/moderator/owner).
7. **Índices**: Crea índices compuestos con `IF NOT EXISTS` para no fallar si ya existen.

## Cómo aplicar

En Supabase (SQL Editor o migrador):

```bash
# Si usas CLI de Supabase
supabase db push
```

O copiar y ejecutar el contenido de `supabase/migrations/034_audit_rls_hardening.sql` en el SQL Editor.

## Comprobaciones después de aplicar

- [ ] Login y registro siguen funcionando.
- [ ] Home muestra ofertas aprobadas (anon y logged in).
- [ ] Votos: el usuario ve solo su voto en cards/modal; admin puede ver en panel si aplica.
- [ ] Comentarios: se ven solo en ofertas aprobadas/publicadas y no expiradas.
- [ ] Reportes: solo moderadores/admin ven lista de reportes.
- [ ] Moderación: solo roles correspondientes ven/insertan en moderation_logs.
- [ ] Eventos (vistas/outbound/share): la app sigue registrando vía `/api/events` (service_role).

## Riesgo general (tras 034)

- **Inmediato**: Bajo, siempre que las funciones helper (`user_has_moderation_role`, `is_moderator`) estén correctas y no devuelvan true para cualquier usuario.
- **Recomendación**: Ejecutar en Supabase la consulta sugerida en la auditoría para listar funciones SECURITY DEFINER y revisar permisos de ejecución.
