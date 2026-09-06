# SIM-TASK-014-USER-J-E2

**Evidence:** E2 Simulation  
**Label:** `SIMULATED` - **NO** es comportamiento de usuarios reales (no E4/E5).

| Campo | Valor |
|---|---|
| SIMULATION-ID | SIM-TASK-014-USER-J-E2 |
| USER | USER-J - Orientado a eficiencia |
| TASK | TASK-014 - Uso movil |
| ENTRY | `/` (salvo gates) |
| INITIAL STATE | auth_assumption=auth; device=unspecified |
| OUTCOME | SUCCESS |
| SIM-ERR | SIM-ERR-0 |
| SIMULATED COGNITIVE LOAD = LOW | (cualitativo) |
| TIME | UNKNOWN |
| INTERACTION COUNT | 4 (SIMULATED) |
| DECISION COUNT | 3 (SIMULATED) |
| ERROR COUNT | 0 (SIMULATED) |
| BACKTRACK COUNT | 0 (SIMULATED) |
| RECOVERY COUNT | 0 (SIMULATED) |

## Shell / navegacion (CONTROL)
- Nav: ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta)
- Search: Search disponible en Home
- Rail: Rail tiendas solo xl

## Attention model (hipotesis E2)
- Home ATTENTION-1: cta
- Home ATTENTION-2: price
- Home ATTENTION-3 (posible ignore): comments
- Detail ATTENTION-1/2/3: precio/descuento / CTA outbound / affiliate disclosure / condiciones (posible ignore)

## Trust
- TRUST SIGNALS AVAILABLE: precio, descuento, tienda, votos, imagen, autor
- TRUST QUESTIONS: n/a en esta corrida
- No se afirma que el usuario "confia".

## Steps

### Step 1 - ENTRY
- SCREEN: /
- VISIBLE INFORMATION: Home CONTROL; ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta); Search disponible en Home
- USER INTERPRETATION: Orientado a eficiencia: interpreta Home como punto de partida para ofertas.
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
- SCREEN: / (mobile chrome)
- VISIBLE INFORMATION: ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta)
- USER INTERPRETATION: Modelo asume viewport movil: Plaza no en tabbar.
- ACTION: Usar tabbar
- INTERACTION TYPE: INT-TAP
- DECISION: Quedarse en Inicio
- REASON: Canal movil documentado en baseline
- UNCERTAINTY: MEDIUM
- SYSTEM RESPONSE: Layout md:hidden tabbar
- NEXT STEP: continuar tarea ancla discovery
- ERROR: SIM-ERR-0
- RECOVERY: n/a

### Step 3 - DISCOVERY
- SCREEN: /
- VISIBLE INFORMATION: Cards OfferCard; tabs; ATTENTION-1=cta; ATTENTION-2=price; ATTENTION-3(posible ignore)=comments
- USER INTERPRETATION: Cree que puede scrollear/filtrar/abrir cards. Prioriza: cta, price, first_viable_card. Puede ignorar: comments, guides, share.
- ACTION: Scroll + inspeccionar cards
- INTERACTION TYPE: INT-SCROLL
- DECISION: Usar modo personalized (Para ti)
- REASON: Perfil USER-J
- UNCERTAINTY: MEDIUM
- SYSTEM RESPONSE: Feed/API o paginas categoria
- NEXT STEP: seleccion card
- ERROR: SIM-ERR-0
- RECOVERY: n/a

### Step 4 - DISCOVERY→DECISION
- SCREEN: /
- VISIBLE INFORMATION: OfferCard: titulo, precio, imagen, votos, heart, CTA Ver oferta
- USER INTERPRETATION: Cree que tocar la card abre mas informacion (ruta real: /oferta/[id]).
- ACTION: CTA Ver oferta o click card
- INTERACTION TYPE: INT-CLICK/TAP
- DECISION: Abrir detalle
- REASON: Primera card viable con CTA claro
- UNCERTAINTY: LOW-MEDIUM
- SYSTEM RESPONSE: cazar_cta event posible + router.push /oferta/[id]
- NEXT STEP: /oferta/[id]
- ERROR: SIM-ERR-0
- RECOVERY: n/a

### Step 5 - OUTCOME
- SCREEN: mobile shell
- VISIBLE INFORMATION: Misma tarea ancla sobre chrome de dispositivo
- USER INTERPRETATION: Completar discovery+open bajo constraints de layout.
- ACTION: Completar ancla 001/004
- INTERACTION TYPE: INT-CLICK
- DECISION: Usar chrome del dispositivo
- REASON: TASK device
- UNCERTAINTY: MEDIUM
- SYSTEM RESPONSE: Responsive CONTROL
- NEXT STEP: end
- ERROR: SIM-ERR-0
- RECOVERY: n/a

## Interactions log
- INT-001: TYPE=NAV; TARGET=Home; PURPOSE=ENTRY; RESULT=Home loaded
- INT-002: TYPE=TAP; TARGET=Tabbar Inicio; PURPOSE=DEVICE; RESULT=Stay home
- INT-003: TYPE=SCROLL; TARGET=Home feed; PURPOSE=DISCOVERY; RESULT=Candidates visible
- INT-004: TYPE=CLICK; TARGET=OfferCard; PURPOSE=OPEN_DETAIL; RESULT=Navigate /oferta/[id]

## Decisions log
- DEC-M1: OPTIONS=[Inicio, Guia, Subir, Favoritos, Perfil]; CHOSEN=Inicio; REASON=Explorar ofertas; CONFIDENCE=MEDIUM
- DEC-D1: OPTIONS=[vitales, top, latest, personalized?, categoria]; CHOSEN=personalized (Para ti); REASON=Sesgo USER-J; CONFIDENCE=HIGH
- DEC-06: OPTIONS=[ignorar, abrir, votar en card, fav en card]; CHOSEN=abrir; REASON=Primera card viable con CTA claro; CONFIDENCE=HIGH

## Potential abandonment
- Ninguno destacado en esta corrida (E2).

## Friction hypotheses (E2)
- Plaza ausente en movil puede alterar discovery social

## Time
TIME = UNKNOWN - sin fundamento OBSERVED; no se inventan segundos. Candidates: network feed, navigation, decision gap, loading.

## Agents (roles consultados en diseno de esta corrida)
AGENT-12, AGENT-01, AGENT-03, AGENT-05, AGENT-06, AGENT-09, AGENT-10

## Independence note
Corrida generada de forma aislada USER×TASK sin leer outcomes de otras celdas como evidencia.

---
*Fin corrida SIMULATED E2.*
