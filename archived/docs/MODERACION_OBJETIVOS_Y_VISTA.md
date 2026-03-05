# Moderación: objetivos de calidad y vista para aprobar

Dos mejoras para el panel de moderación: (1) metas por categoría/tienda para control de calidad, (2) vista completa de la oferta para poder inspeccionar bien antes de aprobar o rechazar.

---

## 1. Objetivos de calidad para mods

**Idea:** Que los moderadores tengan metas visibles del tipo “cuántas ofertas de X categoría o de Y tienda deberían revisar/aprobar hoy (o esta semana)”.

Ejemplos:
- “Tecnología: al menos 5 ofertas aprobadas hoy.”
- “Amazon: al menos 3 ofertas esta semana.”
- “Electrónica: 10 ofertas en cola; objetivo 8 aprobadas.”

**Implementación posible:**
- En Admin → Moderación, un bloque “Objetivos del día/semana” con contadores por categoría (y opcional por tienda): pendientes, aprobadas hoy, rechazadas hoy.
- Las metas pueden ser configurables (ej. en env o en una tabla `moderation_goals`: category, store, target_per_day, target_per_week). Primera versión: metas fijas en código o en un doc interno; después, si hace falta, pantalla de configuración.

Así los mods saben en qué enfocarse y puedes medir si estás cubriendo variedad (tecnología, hogar, etc.) y no solo cantidad.

---

## 2. Vista de la oferta para inspeccionar bien

Hoy en la tarjeta de moderación el mod ve: imagen, título, precio, precio original, tienda, fecha, autor, ofertas similares, y un botón “Ver oferta” que abre un modal con lo mismo + URL truncada. **No se muestran descripción ni pasos (“cómo obtener la oferta”).**

Para aprobar o rechazar con criterio (¿está bien redactado? ¿los pasos son razonables? ¿el enlace es correcto?), conviene que el mod pueda ver:

- **Descripción completa** de la oferta (si existe el campo).
- **Pasos** (“Cómo obtener la oferta”: paso 1, paso 2, …).
- **URL completa** en un bloque que se pueda copiar o abrir (no solo truncada).
- **Condiciones / cupones** si existen.

**Implementación:**
- En la query de ofertas pendientes (moderation page), incluir en el `select` los campos `description`, `steps`, `conditions` (y `coupons` si aplica).
- En `ModerationOfferCard`:  
  - En la tarjeta principal, opcionalmente un resumen (ej. “Descripción: …” con 2–3 líneas).  
  - En el modal “Ver oferta”, mostrar descripción completa, lista de pasos, condiciones y URL completa (con enlace “Abrir” y “Copiar”).
- Así el mod puede inspeccionar la oferta igual que la vería un usuario y decidir aprobar o rechazar con motivo claro.

---

## 3. Prioridad

- **Vista mejorada (descripción, pasos, URL):** Alta — impacta directamente la calidad de las decisiones de aprobación/rechazo.
- **Objetivos por categoría/tienda:** Media — muy útil para control de calidad y variedad; se puede empezar con contadores simples y metas en doc o config.
