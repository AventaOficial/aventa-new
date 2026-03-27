# Documento Maestro AVENTA

Versión: 1.0  
Fecha: 2026-03-27  
Objetivo: visión integral del sistema (arquitectura, esquemas, flujos, botones, gamificación, monetización y riesgos).

---

## 1) Resumen ejecutivo

AVENTA hoy tiene una base sólida en:
- Feed de ofertas con ranking (`ofertas_ranked_general`).
- Reputación por usuario (`reputation_score`, `reputation_level`).
- Moderación, admin y métricas de actividad.
- Tracking de vistas / salidas / compartidos.

Los ejes a fortalecer para escalar sin errores caros:
- Unificar reglas de dominio en una sola fuente de verdad (categorías ya encaminado).
- Formalizar gamificación (medallas, progreso, eventos).
- Formalizar monetización por niveles (comisiones reales, ledger, conciliación).
- Elevar observabilidad, anti-fraude y pruebas de contrato.

---

## 2) Arquitectura general

### 2.1 Stack
- Frontend/Backend: Next.js (App Router, `app/`).
- Datos/Auth/Storage: Supabase (Postgres + RLS + Storage).
- Jobs: rutas cron (`/api/cron/daily-digest`, `/api/cron/weekly-digest`).
- UI global: `ClientLayout`, `Navbar`, `ActionBar`, providers (auth/theme/UI).

### 2.2 Superficie principal
- Home: `app/page.tsx`
- Detalle oferta: `app/oferta/[id]/page.tsx`, `OfferPageContent.tsx`
- Categoría: `app/categoria/[slug]/page.tsx`
- Tienda: `app/tienda/[slug]/page.tsx`
- Perfil público: `app/u/[username]/page.tsx`
- Mis áreas: `app/me/page.tsx`, `app/me/favorites/page.tsx`, `app/settings/page.tsx`
- Admin: `app/admin/**`

### 2.3 Capa API (por dominio)
- Feed: `app/api/feed/home`, `app/api/feed/for-you`
- Ofertas y comentarios: `app/api/offers`, `app/api/offers/[offerId]/comments/**`
- Interacciones: `app/api/votes`, `app/api/events`, `app/api/track-view`, `app/api/track-outbound`
- Usuario: `app/api/profile/[username]`, `app/api/me/**`, `app/api/notifications/**`
- Admin: `app/api/admin/**`

---

## 3) Esquemas de datos (alto nivel funcional)

> Nota: esto describe comportamiento y campos usados por código. La fuente final de DDL está en migraciones SQL.

### 3.1 Núcleo
- `offers`: oferta principal (precio, tienda, categoría, estado, autor, ranking, expiración, etc.).
- `profiles`: perfil público + reputación + preferencias + tags de afiliación.
- `offer_votes`: votos de usuarios.
- `offer_favorites`: favoritos.
- `comments`, `comment_likes`: discusión y utilidad social.
- `offer_events`: eventos (`view`, `outbound`, `share`).

### 3.2 Vistas y soporte
- `ofertas_ranked_general`: feed consolidado para home/categoría/tienda.
- `public_profiles_view`: datos públicos de autor (nombre/avatar/badges).

### 3.3 Campos nuevos de dominio (ya contemplados)
- `offers.category` canónica: `tecnologia|gaming|hogar|supermercado|moda|belleza|viajes|servicios|other`
- `offers.bank_coupon`: banco del cupón.
- `offers.tags`: etiquetas libres de producto/tema/tienda.

Migración principal:
- `docs/supabase-migrations/categories_unification_bank_coupon_tags.sql`

---

## 4) Botones y acciones clave (qué hacen y qué guardan)

## 4.1 Home y cards
- `Cazar oferta` (card/modal):
  - Abre detalle o va a URL de tienda.
  - Registra outbound (`offer_events`).
- `Votar arriba/abajo`:
  - Escribe en `offer_votes`.
  - Afecta score/ranking vía lógica SQL/triggers.
- `Favorito`:
  - Inserta/elimina en `offer_favorites`.
- `Compartir`:
  - Copia enlace / canales.
  - Registra evento `share` en `offer_events`.

## 4.2 Subir oferta (ActionBar modal)
- Campos obligatorios: título, precio, categoría, tienda.
- Opcionales: URL, descripción, pasos, condiciones, cupones, MSI, imágenes.
- Nuevos opcionales:
  - `Cupón bancario` -> `offers.bank_coupon`
  - `Etiquetas` -> `offers.tags`
- Guarda por `POST /api/offers`.

## 4.3 Comentarios en oferta
- Crear comentario/reply: `comments`.
- Like comentario: `comment_likes`.
- Reportar comentario/oferta: tablas de reportes y cola de moderación.

## 4.4 Navbar / atajos móvil
- Atajos móvil: Inicio, Descubre, Subir, Favoritos, Perfil.
- `Descubre` activado para móvil en `app/components/ActionBar.tsx`.

---

## 5) Categorías: estado actual y contrato recomendado

### 5.1 Contrato vigente recomendado
- UI muestra macros de `lib/categories.ts`.
- Escritura: toda categoría se normaliza con `normalizeCategoryForStorage`.
- Lectura/filtros: usar solo `getValidCategoryValuesForFeed` y helpers del mismo módulo.

### 5.2 Regla operativa
- Macro categoría y tags deben ser cosas separadas:
  - `category` = clasificación macro estable para negocio/feeds.
  - `tags` = detalle libre (PlayStation, iPhone, banco, etc.).

---

## 6) Gamificación actual (lo que ya existe)

### 6.1 Reputación y niveles
- `reputation_score`, `reputation_level` en `profiles`.
- Cálculo principal vía RPC SQL `recalculate_user_reputation`.
- Efectos actuales:
  - Umbrales de nivel.
  - Auto-aprobación de comentarios/ofertas según nivel.
  - Peso de voto por nivel.

### 6.2 Qué sí existe en UI
- Barra de reputación y nivel en perfil.
- Badges de líder (`leader_badge`) desde perfil público.
- Badge `Destacada` por calidad de oferta (`ranking_blend`).

### 6.3 Qué no existe aún
- Sistema de medallas formal con reglas, progreso y desbloqueos persistidos.
- Catálogo de logros en perfil.
- Motor de “misiones” o temporadas.

---

## 7) Monetización actual (real) vs futura

### 7.1 Hoy
- Se rastrean eventos y clics.
- Hay tagging para Mercado Libre (`ml_tracking_tag` -> parámetro `tag`).
- No hay ledger de comisiones por usuario ni liquidación automática.

### 7.2 Objetivo recomendado
- Crear ledger de ingresos atribuibles por usuario/oferta/período.
- Separar:
  - ingresos brutos,
  - fee plataforma,
  - comisión creador según nivel vigente.
- Conciliación por import/API de afiliados (no manual).

---

## 8) Propuesta AVENTA (no copia) para niveles + comisiones

### 8.1 Definiciones base
- `trust_tier` (confianza): usado para moderación/peso de voto.
- `creator_tier` (monetización): usado para reparto de comisiones.
- Puede iniciar acoplado y luego separarse.

### 8.2 Regla que pediste (formalizada)
- Nivel 1 (entrada monetizable):
  - “primeras 15 ofertas son nuestras” -> tratar como `origin = aventa_editorial`.
  - Condición de paso: completar ese tramo editorial definido por regla.
- Nivel 2:
  - Subir 15 ofertas de comunidad que alcancen 120 votos.
  - Definir técnicamente qué es “120 votos”:
    - Opción A: `up_votes >= 120`
    - Opción B: `score >= 120`
  - Recomendación: elegir una y congelarla en contrato.

### 8.3 Modelo de datos recomendado
- `offers.origin`: `aventa_editorial | community`
- `profiles.creator_tier`
- `creator_tier_progress` (o vista calculada)
- `commission_ledger` / `revenue_attributions`
- `creator_payouts` (cortes y estado de pago)

### 8.4 Reparto sugerido (ejemplo conceptual)
- Nivel 1: % menor al creador, % mayor plataforma.
- Nivel 2: % mayor al creador.
- Regla de snapshot: el tier que aplica es el del momento del evento de ingreso.

---

## 9) Propuesta de medallas AVENTA (identidad propia)

> Evitar clon directo. Mantener lógica familiar pero marca propia.

### 9.1 Estructura
- `badge_definitions`
- `user_badges`
- `badge_events` (auditoría)
- (Opcional) `badge_progress`

### 9.2 Familias de medallas
- Comunidad: comentarios útiles, respuestas, ayuda.
- Cazador: ofertas aprobadas, ofertas destacadas, constancia semanal.
- Calidad: CTR sostenido, baja tasa de rechazo, feedback positivo.
- Impacto: usuarios ayudados, outbound real.
- Especiales: campañas temporales y retos de temporada.

### 9.3 Reglas anti-fraude mínimas
- Caps diarios por tipo de evento.
- Detección de anillos de votos.
- Umbrales de calidad para validar medallas de alto nivel.
- Reversión administrativa de medallas/puntos con traza.

---

## 10) Plan de implementación por fases

### Fase 0 (estabilización)
- Congelar contratos de categoría/tags/bank_coupon.
- Pruebas de contrato en API feed/ofertas.
- Alertas de errores por ruta crítica.

### Fase 1 (base monetización)
- Añadir `offers.origin`, `profiles.creator_tier`, progreso.
- Endpoint `GET /api/me/creator-tier`.
- UI simple de progreso en perfil.

### Fase 2 (ledger comisiones)
- Ingesta ingresos afiliados.
- `commission_ledger` + panel admin de conciliación.
- Primer reporte mensual de prueba.

### Fase 3 (medallas AVENTA)
- Catálogo inicial 8-12 medallas.
- Unlock por jobs/eventos.
- Vitrina en perfil y notificación de desbloqueo.

### Fase 4 (optimización)
- Ajuste de thresholds por data real.
- Experimentos A/B de engagement.
- Endurecer anti-fraude.

---

## 11) Riesgos críticos a controlar

- Ambigüedad de reglas (“120 votos” sin definición técnica única).
- Doble camino de eventos (`track-outbound` y `events`) sin contrato único.
- Falta de ledger auditable para pagos (riesgo legal/financiero).
- Acoplar gamificación a métricas manipulables sin anti-fraude.
- Desalineación docs vs schema real en producción.

---

## 12) Checklist operativo de validación continua

Complementar con:
- `docs/CHECKLIST_SISTEMA_VIVO.md`

Revisión semanal mínima:
- Integridad de categorías y filtros.
- Integridad de eventos y métricas.
- Calidad de moderación y reputación.
- Salud de APIs críticas.
- Estado de migraciones entre entornos.

---

## 13) Decisiones pendientes (para cerrar arquitectura)

- Definición oficial de “120 votos”.
- Definición exacta de “primeras 15 ofertas son nuestras” en dato (`origin` + criterio temporal).
- Tabla final de reparto de comisiones por nivel.
- Catálogo inicial de medallas AVENTA y criterios.
- Política de pago (frecuencia, umbral mínimo, soporte de incidencias).

---

## 14) Archivos clave para mantenimiento

- `lib/categories.ts`
- `app/api/offers/route.ts`
- `app/api/feed/home/route.ts`
- `app/api/feed/for-you/route.ts`
- `app/components/ActionBar.tsx`
- `app/components/OfferCard.tsx`
- `app/page.tsx`
- `docs/supabase-migrations/categories_unification_bank_coupon_tags.sql`
- `docs/CHECKLIST_SISTEMA_VIVO.md`

