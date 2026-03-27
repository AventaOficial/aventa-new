# Checklist vivo de auditoría técnica (AVENTA)

> Objetivo: detectar desalineaciones de negocio/datos antes de que impacten usuarios, ingresos o reputación.
> Uso recomendado: revisar semanalmente en equipo y marcar fecha/responsable por bloque.

## 0) Cómo usar este checklist

- [ ] Definir responsable por bloque (Producto, Backend, Frontend, Data, Seguridad).
- [ ] Revisar en `staging` antes de producción.
- [ ] Registrar hallazgos con severidad: `P0` (rompe negocio), `P1` (impacto alto), `P2` (mejora).
- [ ] Convertir cada hallazgo en issue con dueño y fecha.

## 1) Dominio de datos (Single Source of Truth)

- [ ] `offers.category` usa solo catálogo canónico (`tecnologia`, `gaming`, `hogar`, `supermercado`, `moda`, `belleza`, `viajes`, `servicios`, `other`).
- [ ] `preferred_categories` en `profiles` usa el mismo vocabulario canónico.
- [ ] `bank_coupon` solo usa valores permitidos.
- [ ] `tags` se guarda como array limpio (sin vacíos/duplicados).
- [ ] Ninguna query mezcla lógica de categoría distinta a `lib/categories.ts`.

## 2) Feed y descubrimiento

- [ ] Home (`/`) aplica los mismos filtros de categoría en todas las variantes (API/fallback/Supabase).
- [ ] `/categoria/[slug]` usa la misma resolución de categoría que home.
- [ ] Feed “Para ti” (`/api/feed/for-you`) compara categorías normalizadas (no string crudo).
- [ ] Filtros por tienda y categoría funcionan combinados.
- [ ] Paginación no rompe al aplicar filtros.

## 3) Subida de ofertas (UI + API + BD)

- [ ] Formulario valida obligatorios y formatos.
- [ ] Categoría enviada desde UI llega normalizada al backend.
- [ ] `cupón bancario` se envía/guarda correctamente.
- [ ] `tags` se envían/guardan correctamente.
- [ ] Si faltan columnas nuevas en BD, el backend degrada sin romper publicación.

## 4) Tarjetas y detalle de oferta

- [ ] `OfferCard` muestra MSI y cupón bancario sin romper layout.
- [ ] Votos/favoritos mantienen estado correcto tras refresco.
- [ ] Enlace a oferta y tracking de outbound/share no fallan.
- [ ] Página `/oferta/[id]` normaliza categoría para URL y breadcrumbs.

## 5) APIs (contrato y seguridad)

- [ ] Todas las rutas críticas validan auth/rol/rate limit.
- [ ] Errores devuelven mensajes consistentes y útiles.
- [ ] No hay rutas admin accesibles con token no autorizado.
- [ ] APIs de feed responden con contrato estable (campos esperados por frontend).
- [ ] Logs incluyen contexto mínimo para diagnóstico (sin exponer secretos).

## 6) Supabase (migraciones + RLS)

- [ ] Migraciones se aplican en orden en `staging` y luego `prod`.
- [ ] Vista `ofertas_ranked_general` incluye columnas requeridas por frontend.
- [ ] Policies RLS de `offers`, `votes`, `favorites`, `comments` siguen vigentes.
- [ ] Buckets de imágenes mantienen permisos esperados.
- [ ] No hay drift entre esquema real y lo documentado.

## 7) Calidad, pruebas y observabilidad

- [ ] Existe prueba de contrato para categorías (macro + legacy).
- [ ] Existe prueba para publicación con `bank_coupon` y `tags`.
- [ ] Alertas de errores 5xx por endpoint crítico.
- [ ] Métricas de latencia p95 para feed/subida.
- [ ] Flujo de rollback documentado para migraciones de datos.

## 8) Riesgos de negocio (escala y venta del proyecto)

- [ ] Riesgos `P0/P1` con plan de mitigación y fecha.
- [ ] Dependencias externas críticas inventariadas.
- [ ] Documentación técnica y de arquitectura actualizada.
- [ ] Evidencia de monitoreo, backups y continuidad operativa.
- [ ] Inventario de deuda técnica con impacto económico estimado.

## 9) Registro de revisiones

| Fecha | Responsable | Alcance | Hallazgos P0 | Hallazgos P1 | Estado |
|---|---|---|---:|---:|---|
| _pendiente_ | _pendiente_ | _pendiente_ | 0 | 0 | _pendiente_ |
