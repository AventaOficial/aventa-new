# Evidence — Obs / Interp / Hyp / Unknown

## OBSERVATION (E3)

1. Tablas `plaza_requests` y `plaza_discussions` existen en Prod (`mkgsrpsuvedwwlzmzmzh`).  
2. Ambas tienen **0 filas**.  
3. `request_responses` **no** existe.  
4. Status requests: `pending|approved|closed` — sin `rejected`.  
5. GET lista solo `approved`; POST fuerza `pending`.  
6. UI «Ayudar a cazar» → upload con título, sin `request_id`.  
7. Telemetría: `view|outbound|share|cazar_cta` — sin eventos de Plaza request lifecycle.  
8. `cazar_cta` count = 0 en Prod.  
9. ~16 users/profiles; pocos sign-ins recientes; contexto beta privada sin comunidad activa (stakeholder).  
10. Proyecto secundario sin tablas Plaza.

## INTERPRETATION

- Plaza está **desplegada como shell** sin tracción de demanda medida.  
- No se puede estudiar comportamiento de help-seeking **in-product** todavía.  
- El loop demand→offer documentado en HSE-03 permanece incompleto también en datos Prod.

## HYPOTHESIS (E1 — no E3)

- La ausencia de filas refleja falta de usuarios activos + posible falta de descubrimiento/moderación, no necesariamente ausencia del job en el mercado.  
- Cold start sería severo si se activara demand hunting ahora.

## UNKNOWN

- ¿Alguien intentó crear requests que fallaron antes de persistir?  
- ¿Moderación manual fuera de repo alguna vez aprobó algo (hoy 0)?  
- ¿Usuarios beta usaron grupos externos en lugar de Plaza?  
- Valor percibido del job B (necesita E4).

## Niveles

| Claim | Nivel |
|---|---|
| Conteos Plaza = 0 | E3 |
| Schema sin responses | E3 |
| “Usuarios no activos / beta” | Stakeholder context + E3 escala pequeña |
| “El job no existe” | **No reclamable** — sería falso E4 |
| Hipótesis HSE-04 válida/inválida | UNKNOWN vía Plaza |
