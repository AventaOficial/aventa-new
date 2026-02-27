# Checklist esencial — qué debe tener una página de ofertas

## Lo básico

| Item | Tenemos | Funciona |
|------|---------|----------|
| Feed de ofertas visible | ✅ | ✅ |
| Ofertas con precio, descuento, imagen | ✅ | ✅ |
| Buscador | ✅ | ✅ |
| Filtros (General, Top, Recientes, Para ti) | ✅ | ⚠️ Para ti = Recientes |
| Cargar más ofertas | ✅ | ✅ |
| Ver detalle de oferta (modal) | ✅ | ✅ |
| Enlace a tienda (Ir directo) | ✅ | ✅ |

## Lo esencial

| Item | Tenemos | Funciona |
|------|---------|----------|
| Crear cuenta / Iniciar sesión | ✅ | ✅ |
| Subir oferta | ✅ | ✅ |
| Moderación de ofertas | ✅ | ✅ |
| Votar (útil / no útil) | ✅ | ✅ |
| Favoritos | ✅ | ✅ |
| Comentarios en ofertas | ✅ | ✅ |
| Perfil de usuario | ✅ | ✅ |
| Configuración (nombre) | ✅ | ✅ |
| Modo oscuro | ✅ | ✅ |

## Lo que caracteriza

| Item | Tenemos | Funciona |
|------|---------|----------|
| Luna (chatbot) | ✅ | ⚠️ Mock |
| Comunidades | ✅ | ⚠️ Placeholder |
| Reseñas | ❌ | — Próximamente |
| Feed "Para ti" personalizado | ⚠️ | ❌ |
| Afiliación (link conversion) | ❌ | — |
| Login con proveedor nativo/Google | ❌ | — |
| Dominio propio | ❌ | — |

## Análisis de éxito

### ¿Aumentan las posibilidades con estos cambios?

Sí. Los cambios aplicados mejoran:

1. **Identidad visual** — Hero y sidebar más coherentes, menos genéricos.
2. **Navegación** — Comunidades visible; el usuario entiende que habrá hubs.
3. **Expectativas** — Reseñas marcadas como "Próximamente" evita confusión.
4. **Configuración** — Página más clara y presentable.

### Qué falta para lanzar

| Prioridad | Item | Esfuerzo |
|-----------|------|----------|
| Alta | Dominio | Bajo |
| Alta | Login proveedor nativo/Google | Medio |
| Alta | Seed de ofertas (20–50) | Bajo |
| Media | RLS en Supabase | Medio |
| Media | Unificar status (approved vs published) | Bajo |
| Baja | Afiliación (link conversion) | Alto |
| Baja | Comunidades reales | Alto |

### Reseñas: ¿qué tan próximamente?

- **Tabla `offer_reviews`:** Crear en Supabase.
- **API:** POST/GET reseñas por oferta.
- **UI:** Reutilizar estructura actual (ya está en el modal, oculta).
- **Esfuerzo estimado:** 1–2 días para MVP básico.
