# Auditoría de cambios de diseño - AVENTA

## Resumen ejecutivo

Documento que registra todos los cambios de diseño y estructura aplicados a la aplicación AVENTA, organizados por sesión y componente.

---

## 1. Flujo de Guía (Onboarding)

### Cambio aplicado
- **Antes:** La guía se mostraba tanto al crear cuenta como al iniciar sesión.
- **Después:** La guía solo se muestra al **crear cuenta** (signup). Al iniciar sesión (signin) se cierra el modal y no se muestra la guía.

### Implementación
- `OnboardingV1.tsx`: `onJustSignedUp` ahora ejecuta `markJustSignedUp()`, `closeRegisterModal()` y `openGuide()`.
- `onSuccess` solo cierra el modal (para ambos flujos).
- La transición de Campana + Avatar al iniciar sesión es visible porque la guía ya no se superpone.

### Archivos modificados
- `app/components/OnboardingV1.tsx`

---

## 2. OfferModal (card extendida) - móvil

### Problema
- En móvil, al hacer scroll el contenido se movía lateralmente y se sentía "suelto".

### Cambios aplicados
- `overflow-x-hidden` en el contenedor del modal y en el overlay.
- `overscroll-contain` y `touch-pan-y` para limitar el scroll al eje vertical.
- `min-w-0` en el área de contenido para evitar desbordes en flex.

### Archivos modificados
- `app/components/OfferModal.tsx`

---

## 3. OfferCard (home)

### Cambios aplicados

#### 3.1 Eliminación de Comentarios
- Eliminado el botón "Comentarios" del footer de las cards en el home.
- Los comentarios siguen disponibles en la vista extendida (OfferModal).

#### 3.2 Votos más prominentes
- Área de votos con fondo `bg-gray-100/80` y `rounded-xl`.
- Botones con `min-h-[36px] min-w-[36px]` para mejor área táctil.
- Iconos de `h-3.5` a `h-4`.
- Voto seleccionado en violeta (`fill-violet-600`) en lugar de negro.
- Score con `font-semibold` y mayor contraste.

#### 3.3 Botón de favoritos
- Mismo tamaño mínimo (36px) para consistencia.

### Archivos modificados
- `app/components/OfferCard.tsx`

---

## 4. Filtros de período

### Cambio aplicado
- **Antes:** "Período: Hoy, Semana, Mes" visible en General, Top y Recientes.
- **Después:** Solo visible cuando el modo es **Top**.

### Archivos modificados
- `app/page.tsx`

---

## 5. Feed "Para ti"

### Cambio aplicado
- Añadida la pestaña **"Para ti"** en el segmented control.
- Visible solo cuando el usuario tiene sesión iniciada.
- Por ahora usa la misma lógica de fetch que "Recientes" (orden por `created_at`).
- Pendiente: integrar backend de personalización (favoritos, historial, etc.).

### Archivos modificados
- `app/page.tsx`

---

## 6. Cambios previos (sesiones anteriores)

### 6.1 Header / Navbar
- Sin sesión: Crear cuenta + Modo oscuro (sin notificaciones ni usuario).
- Con sesión: Campana + Avatar.
- Orden: Crear cuenta primero, Modo oscuro después.
- Safe area: `pt-[max(0.75rem,env(safe-area-inset-top))]`.
- Transición con AnimatePresence + motion para Campana y Avatar.

### 6.2 Hero
- Padding derecho móvil: `pr-36 sm:pr-40`.
- Safe area: `pt-[env(safe-area-inset-top)]`.
- Buscador con estilo "invisible" (solo línea inferior).

### 6.3 Botones "Ir directo" y "Cazar oferta"
- OfferCard: "Ir directo" (abre URL) y "Cazar oferta" (abre modal).
- OfferModal: botón "Ir directo" (antes "Cazar oferta").

### 6.4 Guía y Modo oscuro en menú de usuario
- Con sesión: Guía y Modo oscuro dentro del menú del avatar.
- Sin sesión: Modo oscuro como botón independiente.

### 6.5 Paleta de colores
- Violeta, púrpura y rosa en lugar de azul.
- Gradientes: `from-violet-600 via-purple-600 to-pink-500`.

### 6.6 FAB Luna (ChatBubble)
- En móvil: posición a la izquierda para no tapar Perfil.

---

## 7. Objetivos de diseño (checklist)

| Objetivo | Estado |
|----------|--------|
| Usuario entiende qué es AVENTA | En progreso (branding, tagline) |
| Sensación de calidad | En progreso (microinteracciones, paleta) |
| Recompensa inmediata (ver ofertas) | Cumplido (feed visible) |
| Transmitir "mejores ofertas" sin sensación de venta | En progreso (copy aplicado, reforzar en más puntos) |
| Votos accesibles y claros | Cumplido (área táctil 36px) |
| OfferModal estable en móvil | Cumplido (overflow corregido) |

---

## 8. Archivos tocados en esta sesión

- `app/components/OnboardingV1.tsx` – Guía solo en signup
- `app/components/OfferModal.tsx` – Scroll lateral corregido
- `app/components/OfferCard.tsx` – Sin comentarios, votos más prominentes
- `app/page.tsx` – Período solo en Top, tab "Para ti"

---

## 9. OfferCard y OfferModal - sesión actual

### OfferCard
- **Mobile:** Votos debajo de la imagen.
- **Desktop:** Votos arriba de los botones "Cazar oferta" / "Ir directo".
- Botones más grandes en PC (`md:px-5 md:py-3`, `md:text-sm`).
- Favoritos arriba a la derecha.

### OfferModal
- Header rediseñado: imagen principal arriba, favoritos y cerrar en esquinas.
- Precios con jerarquía clara (estilo premium): precio actual destacado, original tachado, % discreto.
- Mensaje comunidad: "La comunidad encontró esta oferta. No vendemos nada — somos cazadores de ofertas."
- Botón Luna dentro del modal: "Preguntar a Luna sobre esta oferta" (discreto).
- Footer: solo "Ir directo" (favoritos ya en header).
- Eliminada galería mock y código no usado.

### Copy (mejores ofertas sin sensación comercial)
- `layout.tsx`: "Comunidad de cazadores de ofertas. No vendemos nada."
- `ChatBubble`: "asistente de la comunidad", respuestas centradas en "lo que la comunidad encuentra".
- `OnboardingV1`, `Onboarding`, `ActionBar`: "Comparte lo que encuentres", "La comunidad decide".
- `page.tsx` toast favoritos: "La comunidad encuentra las mejores ofertas."

---

## 10. Feed "Para ti" - estado actual

- **Lógica:** `viewMode === 'personalized'` usa la misma query que "Recientes": `order('created_at', { ascending: false })`.
- **No hay personalización real:** No se filtran ofertas por favoritos, historial ni preferencias.
- **Pendiente:** Backend que ordene/filtre por `offer_favorites`, categorías vistas, etc.

---

## 11. Pendientes

1. **Feed "Para ti":** Implementar lógica de personalización en backend.
2. **Desktop:** Revisar layout y jerarquía visual (parcialmente aplicado).
