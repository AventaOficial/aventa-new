# Auditoría Técnica - Proyecto AVENTA

**Fecha:** Febrero 2025  
**Objetivo:** Identificar riesgos técnicos, deuda y optimizaciones antes de escalar a 10k usuarios simultáneos.

---

## 1. Componentes con excesiva responsabilidad

| Componente | Líneas | Problemas |
|------------|--------|-----------|
| **OfferModal** | ~657 | Modal + votos + comentarios + reseñas mock + carrusel imágenes + tracking. Demasiadas responsabilidades. `mockImages` y `mockReviews` son datos muertos que nunca se usan con datos reales. |
| **ActionBar** | 564 | Navbar móvil + modal de subida + formulario completo + cooldown + validación. Debería dividirse en `ActionBar`, `UploadOfferModal`, `OfferForm`. |
| **page.tsx (Home)** | 436 | Fetch + filtros + búsqueda + realtime + lista + modal. `fetchOffers` no está en `useCallback`; dependencias de `useEffect` incompletas. |
| **OfferCard** | ~438 | Render + votos + favoritos + 2 fetches por card (get_user_vote, offer_favorites). Con 10 cards = 20 requests extra por vista. |

**Recomendación:** Extraer lógica de OfferModal (comentarios, reseñas) a hooks. Dividir ActionBar. Crear hook `useOfferFetcher` para centralizar fetch.

---

## 2. Hooks repetidos y patrones duplicados

### `refetchAllVisibleOfferVotes` duplicado en 4 archivos
- `app/page.tsx` (usa `ofertas_scores`)
- `app/me/page.tsx` (usa `offer_vote_totals`)
- `app/u/[username]/page.tsx` (usa `offer_vote_totals`)
- `app/me/favorites/page.tsx` (usa `offer_vote_totals`)

**Problema:** Lógica idéntica, fuentes de datos distintas. Inconsistencia: home usa `ofertas_scores`, el resto usa `offer_vote_totals`.

### `rowToOffer` / mapeo de ofertas duplicado
- `page.tsx`, `me/page.tsx`, `me/favorites/page.tsx` tienen versiones propias.
- Tipos `OfferRow`, `MappedOffer`, `Offer` repetidos.

**Recomendación:** Crear `lib/offers.ts` con `rowToOffer`, `refetchOfferVotes` y tipos compartidos.

### `useTheme()` como “forzar re-render”
```tsx
useTheme(); // Forzar re-render cuando cambia el tema
```
Usado en: Hero, page.tsx, ChatBubble, ActionBar, me, u/[username], favorites.

**Problema:** Cualquier cambio de tema re-renderiza todos estos componentes. Solo DarkModeToggle y Navbar necesitan el tema; el resto no lo usa.

**Recomendación:** Quitar `useTheme()` donde no se use `theme`, `isDark` o `toggleTheme`.

---

## 3. Posibles memory leaks

### AuthProvider
```tsx
supabase.auth.getSession().then(...)
const { data: { subscription } } = supabase.auth.onAuthStateChange(...)
return () => subscription.unsubscribe()
```
**Riesgo:** `getSession` y `onAuthStateChange` se ejecutan en paralelo. Si el componente se desmonta antes de que terminen, el `then` podría ejecutarse tras el unmount. Bajo, pero existe.

### ChatBubble – `handleSendMessage`
```tsx
if (messageCount + 2 >= 8) {
  setTimeout(() => {
    setMessages((prev) => [...prev, finalMessage]);
  }, 1000);
}
```
**Riesgo:** Si el usuario cierra el chat antes del segundo, el `setTimeout` sigue activo y llama a `setMessages` en un componente desmontado.

**Recomendación:** Guardar el id del timeout y limpiarlo en un `useEffect` cleanup.

### OfferModal – múltiples `useEffect`
Los `useEffect` tienen cleanup correcto (scroll, `setOfferOpen`). El fetch de comentarios no se cancela si el modal se cierra antes de que responda.

**Recomendación:** Usar `AbortController` para cancelar fetches al desmontar.

---

## 4. Re-renders innecesarios

1. **`useTheme()` sin uso de tema:** 8+ componentes se re-renderizan en cada cambio de tema sin necesitarlo.
2. **`onCardClick={() => setSelectedOffer(offer)}`:** Nueva función en cada render por cada card. Con 20 ofertas = 20 funciones nuevas por render.
3. **`handleFavoriteChange`:** Se pasa a cada OfferCard; si no está memoizado, provoca re-renders en cascada.
4. **`ClientLayout`:** Re-renderiza todo el layout cuando cambia `toastMessage`.

**Recomendación:** Memoizar callbacks con `useCallback`. Usar `React.memo` en OfferCard si las props son estables. Reducir uso de `useTheme()` a los componentes que realmente lo necesitan.

---

## 5. Fetches duplicados

### Por card (OfferCard)
Cada OfferCard hace 2 fetches al montar (si hay sesión):
- `get_user_vote` (RPC)
- `offer_favorites` (SELECT)

Con 10 cards y usuario logueado = 20 requests extra por carga de página.

**Recomendación:** Cargar votos y favoritos por lote a nivel de página y pasarlos como props, o usar un contexto de ofertas.

### Realtime – refetch masivo
`useOfferVotesRealtime` se suscribe a **todos** los cambios en `offer_votes`. Cada voto en la plataforma dispara `refetchAllVisibleOfferVotes` en **todas** las páginas con ofertas visibles.

Con 10k usuarios y ~100 votos/min, cada cliente conectado podría hacer ~100 refetches/min.

**Recomendación:** Filtrar por `offer_id` de las ofertas visibles o usar un canal por página/lista en lugar de uno global.

---

## 6. Estados globales y simplificación

| Estado | Ubicación | Observación |
|--------|-----------|-------------|
| `isOfferOpen` | UIProvider | Usado para ocultar ActionBar/ChatBubble. Correcto. |
| `toastMessage` | UIProvider | Toast global. Correcto. |
| `showOnboarding` | UIProvider | Muchos flags de UI en el mismo provider. Considerar dividir. |
| `session` / `user` | AuthProvider | Correcto. |

**UIProvider:** Agrupa onboarding, modal de registro, toast, `isOfferOpen`, guía. Demasiadas responsabilidades en un solo contexto.

**Recomendación:** Separar en `ToastProvider`, `OnboardingProvider` o similar para reducir re-renders y claridad.

---

## 7. Supabase client

- **Patrón:** Singleton en `lib/supabase/client.ts`. Correcto.
- **Uso:** `createClient()` se llama en muchos sitios; siempre devuelve la misma instancia. Sin problema.
- **Server vs client:** `lib/supabase/server.ts` para API routes. Correcto.

---

## 8. Suscripciones realtime y limpieza

### useOfferVotesRealtime
```tsx
return () => supabase.removeChannel(channel);
```
**Limpieza:** Correcta. Se desuscribe al desmontar.

**Problema de diseño:** Un solo canal para toda la tabla `offer_votes`. Cualquier INSERT/UPDATE/DELETE dispara el callback. No hay filtro por `offer_id`.

---

## 9. Dependencias en useEffect

### page.tsx (Home)
```tsx
useEffect(() => {
  if (pathname !== '/') return;
  if (debouncedQuery.trim()) { /* search */ }
  else {
    fetchOffers();  // usa timeFilter, viewMode
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }
}, [pathname, viewMode, timeFilter, debouncedQuery]);  // fetchOffers NO está
```
**Problema:** `fetchOffers` no está en las dependencias. Usa `timeFilter` y `viewMode`; al cambiar, el efecto se vuelve a ejecutar y llama a la versión actual de `fetchOffers`, así que en la práctica puede funcionar. Pero `fetchOffers` se recrea en cada render; si se añadiera a las deps sin `useCallback`, habría bucles.

**Recomendación:** Envolver `fetchOffers` en `useCallback` con `[timeFilter, viewMode]` y añadirlo a las dependencias del efecto.

---

## 10. Código muerto e imports innecesarios

| Archivo | Problema |
|---------|----------|
| **OfferCard** | `const { theme } = useTheme()` – `theme` no se usa. |
| **OfferModal** | `mockImages`, `mockReviews` – datos mock que no se conectan a datos reales. |
| **page.tsx** | `console.log("Home render")`, `console.log("fetch ejecutado")` – eliminar en producción. |
| **OfferModal** | `AlertCircle` importado – verificar si se usa. |

---

## 11. Props drilling

**OfferCard** recibe 14+ props:
```
offerId, title, brand, originalPrice, discountPrice, discount,
description, image, upvotes, downvotes, votes, offerUrl, author,
onCardClick, onFavoriteChange
```

**Recomendación:** Pasar un único objeto `offer` y opcionalmente `onCardClick`, `onFavoriteChange`:
```tsx
<OfferCard offer={offer} onCardClick={...} onFavoriteChange={...} />
```

---

## 12. Riesgos al escalar a 10k usuarios

| Riesgo | Impacto | Probabilidad |
|--------|---------|--------------|
| Realtime: refetch en cada voto global | Alto – cientos de refetches/min por cliente | Alta |
| 2 fetches por OfferCard × N cards | Medio – 20–40 requests extra por carga | Alta |
| Re-renders por `useTheme()` | Medio – CPU en cliente | Media |
| Vista `ofertas_scores` sin índices | Alto – consultas lentas con muchos datos | Media |
| Sin paginación en lista de ofertas | Alto – cargar 100+ ofertas de golpe | Alta |
| Sin rate limiting en API | Alto – abuso posible | Media |

---

## 13. Lista priorizada de riesgos técnicos

### Crítico (arreglar primero)
1. **Realtime sin filtro:** Refetch en cada voto de cualquier oferta. Filtrar por ofertas visibles o usar canales por lista.
2. **Sin paginación:** Cargar todas las ofertas puede ser inviable con 10k usuarios y miles de ofertas.
3. **Fetches por card:** 2 requests por OfferCard. Mover a batch a nivel de página.

### Alto
4. **`fetchOffers` sin `useCallback`:** Dependencias de `useEffect` incorrectas; riesgo de bugs sutiles.
5. **Inconsistencia ofertas_scores vs offer_vote_totals:** Unificar fuente de datos.
6. **Memory leak en ChatBubble:** Limpiar `setTimeout` en unmount.

### Medio
7. **`useTheme()` innecesario:** Reducir re-renders eliminando llamadas que no usan el tema.
8. **OfferModal demasiado grande:** Dividir en subcomponentes/hooks.
9. **Código muerto:** Quitar `theme` no usado, `console.log`, mocks no usados.

### Bajo
10. **Props drilling en OfferCard:** Refactor a objeto `offer`.
11. **Lógica duplicada:** Centralizar `rowToOffer` y `refetchOfferVotes`.

---

## 14. Qué puede romperse primero

1. **Rendimiento de la home:** Con muchas ofertas y votos activos, la combinación de realtime + refetch + fetches por card puede saturar cliente y servidor.
2. **Supabase:** Sin límites ni paginación, las consultas a `ofertas_scores` pueden volverse lentas.
3. **Experiencia móvil:** Re-renders y fetches excesivos afectan más a dispositivos lentos.

---

## 15. Qué optimizar antes de escalar

### Fase 1 (1–2 días)
- [ ] Añadir paginación o “cargar más” en la lista de ofertas.
- [ ] Filtrar realtime por `offer_id` de ofertas visibles.
- [ ] Batch de votos y favoritos: cargar por página, no por card.
- [ ] Eliminar `console.log` de producción.

### Fase 2 (3–5 días)
- [ ] Envolver `fetchOffers` en `useCallback` y corregir dependencias.
- [ ] Unificar uso de `ofertas_scores` en todas las páginas.
- [ ] Quitar `useTheme()` donde no se use el tema.
- [ ] Corregir memory leak del `setTimeout` en ChatBubble.

### Fase 3 (1–2 semanas)
- [ ] Extraer hook `useOfferFetcher` y utilidades compartidas.
- [ ] Dividir OfferModal y ActionBar.
- [ ] Memoizar callbacks y considerar `React.memo` en OfferCard.
- [ ] Revisar índices y rendimiento de `ofertas_scores` en Supabase.
