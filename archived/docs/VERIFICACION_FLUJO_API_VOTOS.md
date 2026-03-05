# Verificación ejecutada: flujo POST /api/votes

Este documento recorre el código de `app/api/votes/route.ts` y comprueba punto por punto el flujo descrito en la auditoría (sección 2.1 del prompt de votos).

---

## Flujo esperado (2.1)

- **Request:** body con `offerId`, `value` (2 o -1). Header `Authorization: Bearer <token>`.
- **Pasos:** validar offerId y value → obtener userId del token → si no hay token/user, devolver 200 con `{ ok: false }` → buscar voto existente (offer_id + user_id) → si no existe INSERT; si existe y mismo value DELETE; si existe y distinto value UPDATE → devolver `{ ok: true }` en éxito.

---

## Comprobación paso a paso (código actual)

### 1. Rate limit

- **Código:** Líneas 39–43. Se obtiene IP con `getClientIp(request)`, se llama `enforceRateLimit(ip)`. Si `!limitResult.success` se responde `429` con `{ error: 'Too Many Requests' }`.
- **Estado:** ✅ Correcto. El flujo de votos pasa después solo si el rate limit (Upstash) lo permite.

### 2. Parsear body y validar offerId y value

- **Código:** 44–52. `body = await request.json().catch(() => ({}))`. `offerId` = `body?.offerId` si es string, trim. `value` aceptado solo si `rawValue === 2 || rawValue === -1` (en otro caso `value === null`). Si `!offerId || value === null || !isValidUuid(offerId)` → respuesta `400` con `{ ok: false }`.
- **Estado:** ✅ Correcto. Solo se aceptan `value` 2 o -1 y `offerId` UUID válido.

### 3. Extraer token y devolver 200 + ok: false si falta

- **Código:** 54–60. `Authorization` se lee del header; si empieza por `Bearer ` se toma el token (slice(7).trim()). Si `!token` → `NextResponse.json({ ok: false }, { status: 200 })`.
- **Estado:** ✅ Correcto. Sin token no se intenta escribir; se devuelve 200 con `ok: false` para no revelar si el endpoint existe.

### 4. Comprobar variables de Supabase

- **Código:** 62–67. Si faltan `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_ANON_KEY` se hace log y se responde 200 con `{ ok: false }`.
- **Estado:** ✅ Correcto.

### 5. Obtener userId desde el token

- **Código:** 69–82. Se hace `fetch(`${url}/auth/v1/user`, { headers: { Authorization: Bearer ${token}, apikey: anonKey } })`. Si `!userRes.ok` o si `userData?.id` no existe, se responde 200 con `{ ok: false }`. `userId = userData?.id ?? null`.
- **Estado:** ✅ Correcto. El usuario se identifica solo vía Supabase Auth con el JWT del cliente.

### 6. Cliente Supabase de servidor

- **Código:** 84. `createServerClient()` (usa `SUPABASE_SERVICE_ROLE_KEY`). Las escrituras en `offer_votes` y `notifications` no dependen de RLS del usuario.
- **Estado:** ✅ Correcto para INSERT/UPDATE/DELETE en nombre del backend.

### 7. Buscar voto existente

- **Código:** 86–92. `supabase.from('offer_votes').select('value').eq('offer_id', offerId).eq('user_id', userId).maybeSingle()`. Si `selectError` → log y 200 con `{ ok: false }`.
- **Estado:** ✅ Correcto. Se busca una sola fila por (offer_id, user_id).

### 8. Caso: no existe voto → INSERT

- **Código:** 98–112. Si `!existing`, se hace `insert({ offer_id: offerId, user_id: userId, value })`. Si `insertError` → log y 200 con `{ ok: false }`. Si `value === 2` se llama `notifyOfferOwnerLike(...)`. Se responde 200 con `{ ok: true }`.
- **Estado:** ✅ Correcto. Un solo INSERT por (offer_id, user_id); notificación solo en like.

### 9. Caso: existe y mismo value → DELETE (quitar voto)

- **Código:** 114–126. `existingVal = existing[col]`. Si `existingVal === value` se hace `delete().eq('offer_id', offerId).eq('user_id', userId)`. Si `deleteError` → log y 200 con `{ ok: false }`. Si no, 200 con `{ ok: true }`.
- **Estado:** ✅ Correcto. Toggle: mismo valor = eliminar voto.

### 10. Caso: existe y distinto value → UPDATE

- **Código:** 128–143. Se hace `update({ value }).eq('offer_id', offerId).eq('user_id', userId)`. Si `updateError` → log y 200 con `{ ok: false }`. Si no, y si `value === 2`, se llama `notifyOfferOwnerLike`. Se responde 200 con `{ ok: true }`.
- **Estado:** ✅ Correcto. Cambio de down a up (o al revés) y notificación solo al dar like.

### 11. Catch general

- **Código:** 144–146. Cualquier excepción se registra y se responde 200 con `{ ok: false }`.
- **Estado:** ✅ Correcto. No se filtra información interna al cliente.

---

## Resumen

| Paso | Descripción | Estado |
|------|-------------|--------|
| 1 | Rate limit por IP | ✅ |
| 2 | Validar offerId (UUID) y value (2 o -1) | ✅ |
| 3 | Si no hay token → 200, ok: false | ✅ |
| 4 | Comprobar env Supabase | ✅ |
| 5 | Obtener userId con Supabase Auth | ✅ |
| 6 | Cliente servidor (service_role) | ✅ |
| 7 | Buscar voto existente (offer_id, user_id) | ✅ |
| 8 | No existe → INSERT; si value=2 → notificar | ✅ |
| 9 | Existe y mismo value → DELETE | ✅ |
| 10 | Existe y distinto value → UPDATE; si value=2 → notificar | ✅ |
| 11 | Errores → log y 200 ok: false | ✅ |

El flujo implementado coincide con el descrito en la sección 2.1 del prompt de auditoría de votos. Los posibles fallos que el usuario percibe (“no se guarda”, “lag”) habría que buscarlos en: token no enviado desde el cliente (OfferCard/OfferModal), RLS/permisos en `offer_votes`, o trigger que no actualiza `offers`; la lógica de la API en sí cumple el flujo esperado.
