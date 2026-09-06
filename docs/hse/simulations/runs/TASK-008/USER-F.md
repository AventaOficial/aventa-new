# SIM-TASK-008-USER-F-E2

**Evidence:** E2 Simulation  
**Label:** `SIMULATED` - **NO** es comportamiento de usuarios reales (no E4/E5).

| Campo | Valor |
|---|---|
| SIMULATION-ID | SIM-TASK-008-USER-F-E2 |
| USER | USER-F - Usuario que publica |
| TASK | TASK-008 - Votar |
| ENTRY | `/` (salvo gates) |
| INITIAL STATE | auth_assumption=auth; device=unspecified |
| OUTCOME | SUCCESS |
| SIM-ERR | SIM-ERR-0 |
| SIMULATED COGNITIVE LOAD = MEDIUM | (cualitativo) |
| TIME | UNKNOWN |
| INTERACTION COUNT | 4 (SIMULATED) |
| DECISION COUNT | 2 (SIMULATED) |
| ERROR COUNT | 0 (SIMULATED) |
| BACKTRACK COUNT | 0 (SIMULATED) |
| RECOVERY COUNT | 0 (SIMULATED) |

## Shell / navegacion (CONTROL)
- Nav: ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta)
- Search: Search disponible en Home
- Rail: Rail tiendas solo xl

## Attention model (hipotesis E2)
- Home ATTENTION-1: subir_cta
- Home ATTENTION-2: form_fields
- Home ATTENTION-3 (posible ignore): plaza_browse
- Detail ATTENTION-1/2/3: titulo/imagen / CTA outbound / affiliate disclosure / condiciones (posible ignore)

## Trust
- TRUST SIGNALS AVAILABLE: precio, descuento, tienda, votos, imagen, autor
- TRUST QUESTIONS: n/a en esta corrida
- No se afirma que el usuario "confia".

## Steps

### Step 1 - ENTRY
- SCREEN: /
- VISIBLE INFORMATION: Home CONTROL; ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta); Search disponible en Home
- USER INTERPRETATION: Usuario que publica: interpreta Home como punto de partida para ofertas.
- ACTION: Orientarse
- INTERACTION TYPE: INT-NAV (load)
- DECISION: Continuar exploracion
- REASON: Modelo de entrada baseline
- UNCERTAINTY: LOW-MEDIUM
- SYSTEM RESPONSE: Feed load GET /api/feed/home (o ranked search si busca)
- NEXT STEP: DISCOVERY
- ERROR: SIM-ERR-0
- RECOVERY: n/a

### Step 2 - DISCOVERY
- SCREEN: /
- VISIBLE INFORMATION: Cards OfferCard; tabs; ATTENTION-1=subir_cta; ATTENTION-2=form_fields; ATTENTION-3(posible ignore)=plaza_browse
- USER INTERPRETATION: Cree que puede scrollear/filtrar/abrir cards. Prioriza: subir_cta, form_fields, me_status. Puede ignorar: plaza_browse.
- ACTION: Scroll + inspeccionar cards
- INTERACTION TYPE: INT-SCROLL
- DECISION: Usar modo vitales|latest
- REASON: Perfil USER-F
- UNCERTAINTY: MEDIUM
- SYSTEM RESPONSE: Feed/API o paginas categoria
- NEXT STEP: seleccion card
- ERROR: SIM-ERR-0
- RECOVERY: n/a

### Step 3 - DISCOVERY→DECISION
- SCREEN: /
- VISIBLE INFORMATION: OfferCard: titulo, precio, imagen, votos, heart, CTA Ver oferta
- USER INTERPRETATION: Cree que tocar la card abre mas informacion (ruta real: /oferta/[id]).
- ACTION: Click/tap card
- INTERACTION TYPE: INT-CLICK/TAP
- DECISION: Abrir detalle
- REASON: Primera card que llama atencion
- UNCERTAINTY: LOW-MEDIUM
- SYSTEM RESPONSE: cazar_cta event posible + router.push /oferta/[id]
- NEXT STEP: /oferta/[id]
- ERROR: SIM-ERR-0
- RECOVERY: n/a

### Step 4 - ACTION
- SCREEN: / o /oferta/[id]
- VISIBLE INFORMATION: Controles voto
- USER INTERPRETATION: Espera feedback de score.
- ACTION: POST vote
- INTERACTION TYPE: INT-VOTE
- DECISION: Upvote
- REASON: Oferta util
- UNCERTAINTY: LOW
- SYSTEM RESPONSE: POST /api/votes (posible 403 si expiry)
- NEXT STEP: SUCCESS
- ERROR: SIM-ERR-0
- RECOVERY: n/a

## Interactions log
- INT-001: TYPE=NAV; TARGET=Home; PURPOSE=ENTRY; RESULT=Home loaded
- INT-002: TYPE=SCROLL; TARGET=Home feed; PURPOSE=DISCOVERY; RESULT=Candidates visible
- INT-003: TYPE=CLICK; TARGET=OfferCard; PURPOSE=OPEN_DETAIL; RESULT=Navigate /oferta/[id]
- INT-004: TYPE=VOTE; TARGET=VoteUp; PURPOSE=ACTION; RESULT=Vote recorded

## Decisions log
- DEC-D1: OPTIONS=[vitales, top, latest, personalized?, categoria]; CHOSEN=vitales|latest; REASON=Sesgo USER-F; CONFIDENCE=MEDIUM
- DEC-06: OPTIONS=[ignorar, abrir, votar en card, fav en card]; CHOSEN=abrir; REASON=Primera card que llama atencion; CONFIDENCE=MEDIUM

## Potential abandonment
- Ninguno destacado en esta corrida (E2).

## Friction hypotheses (E2)
- Ninguna adicional.

## Time
TIME = UNKNOWN - sin fundamento OBSERVED; no se inventan segundos. Candidates: network feed, navigation, decision gap, loading.

## Agents (roles consultados en diseno de esta corrida)
AGENT-12, AGENT-01, AGENT-03, AGENT-05, AGENT-06, AGENT-09, AGENT-10

## Independence note
Corrida generada de forma aislada USER×TASK sin leer outcomes de otras celdas como evidencia.

---
*Fin corrida SIMULATED E2.*
