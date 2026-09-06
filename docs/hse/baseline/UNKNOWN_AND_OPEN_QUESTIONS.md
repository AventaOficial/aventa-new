# Unknowns & Open Questions — HSE-01

**Propósito:** no ocultar ambigüedad. Todo lo no verificable queda aquí.

---

## Ambiguities / UNKNOWN

1. **OfferModal** completo existe pero **cero imports** en consumers — ¿código legado o path futuro? Comportamiento vivo = `/oferta/[id]` only.  
2. Copy exacto de muchos toasts de upload/comments sin walkthrough runtime.  
3. Comportamiento visual completo de estados oferta (pending/rejected) en `/me`.  
4. Focus trap / keyboard paths end-to-end.  
5. Contraste y target sizes medidos.  
6. Si búsqueda ranked y API home divergen en ranking (detalle algoritmo: fuera de alcance mínimo).  
7. Abandono de sesión: no hay evento `abandon`.  
8. Diferencias de UX cuando Rewards ON vs OFF (flags env; Production no leída en HSE-01).  
9. Ban UX exacta en cada superficie consumidor.  
10. Plaza: profundidad de flujos write/read no expandida a nivel TASK (fuera de 001–015 núcleo).  
11. Extensión browser: flujo paralelo no modelado en tasks core.  
12. Realtime feed (`useOffersRealtime`) impacto en percepción de “oferta interesante”.  
13. `OBSERVED TIME` / conteos reales de interacciones usuario = UNKNOWN.  
14. Comparación A/B inexistente — correcto; no hay datos E5.

---

## State-conditioned behaviors (requieren runtime)

- OfferCard view tracking solo si `dealStatus === 'approved'` (y no tester).  
- Tab personalized solo con session.  
- Server detalle solo approved + not expired.  
- Vote 403 si expiry/status no permiten.

---

## Auth vs anon matrix (parcial)

| Acción | Anon OfferCard | Anon Detail | Auth |
|---|---|---|---|
| Ver feed/detalle público | sí | sí | sí |
| Voto | toast | silent | API |
| Favorito | redirect `/` | silent | Supabase |
| Outbound | N/A en card | sí (track opcional) | sí |
| Comentar write | N/A | disabled | API |
| Publicar | register modal | — | API |

---

## Open questions para HSE-02+

- ¿Capturar baseline runs `SIMULATED` con AGENT-12 sobre estas tablas?  
- ¿Qué telemetría E3 ya basta para TIME proxies sin nuevos eventos?  
- ¿Deprecar o cablear OfferModal?  
- ¿Unificar gates auth silent vs toast? (documentado; **no corregir** en HSE-01)

---

## Evidence check

| Claim type | Allowed in HSE-01 |
|---|---|
| E3 code observation | sí |
| E4 real users | no (no realizado) |
| E5 experiment | no |
| Invented times/counts | **prohibido** → UNKNOWN |
