# SIM-TASK-012-USER-H-E2

**Evidence:** E2 Simulation  
**Label:** `SIMULATED` - **NO** es comportamiento de usuarios reales (no E4/E5).

| Campo | Valor |
|---|---|
| SIMULATION-ID | SIM-TASK-012-USER-H-E2 |
| USER | USER-H - Usuario movil |
| TASK | TASK-012 - Reencontrar oferta |
| ENTRY | `/` (salvo gates) |
| INITIAL STATE | auth_assumption=anon; device=mobile |
| OUTCOME | PARTIAL |
| SIM-ERR | SIM-ERR-1 |
| SIMULATED COGNITIVE LOAD = MEDIUM | (cualitativo) |
| TIME | UNKNOWN |
| INTERACTION COUNT | 4 (SIMULATED) |
| DECISION COUNT | 2 (SIMULATED) |
| ERROR COUNT | 1 (SIMULATED) |
| BACKTRACK COUNT | 0 (SIMULATED) |
| RECOVERY COUNT | 1 (SIMULATED) |

## Shell / navegacion (CONTROL)
- Nav: ActionBar tabbar (Inicio, Guia, Subir, Favoritos, Perfil) - Plaza no visible
- Search: Search en Hero (md:hidden)
- Rail: HomeDesktopRail no visible

## Attention model (hipotesis E2)
- Home ATTENTION-1: tabbar
- Home ATTENTION-2: hero_search
- Home ATTENTION-3 (posible ignore): desktop_rail
- Detail ATTENTION-1/2/3: titulo/imagen / CTA outbound / affiliate disclosure / condiciones (posible ignore)

## Trust
- TRUST SIGNALS AVAILABLE: precio, descuento, tienda, votos, imagen, autor
- TRUST QUESTIONS: n/a en esta corrida
- No se afirma que el usuario "confia".

## Steps

### Step 1 - ENTRY
- SCREEN: /
- VISIBLE INFORMATION: Home CONTROL; ActionBar tabbar (Inicio, Guia, Subir, Favoritos, Perfil) - Plaza no visible; Search en Hero (md:hidden)
- USER INTERPRETATION: Usuario movil: interpreta Home como punto de partida para ofertas.
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
- VISIBLE INFORMATION: Cards OfferCard; tabs; ATTENTION-1=tabbar; ATTENTION-2=hero_search; ATTENTION-3(posible ignore)=desktop_rail
- USER INTERPRETATION: Cree que puede scrollear/filtrar/abrir cards. Prioriza: tabbar, hero_search, cards. Puede ignorar: desktop_rail.
- ACTION: Scroll + inspeccionar cards
- INTERACTION TYPE: INT-SCROLL
- DECISION: Usar modo vitales|latest
- REASON: Perfil USER-H
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

### Step 4 - DISCOVERY
- SCREEN: /
- VISIBLE INFORMATION: scroll feed
- USER INTERPRETATION: No hay historial dedicado en baseline - usa favoritos o scroll.
- ACTION: scroll feed
- INTERACTION TYPE: INT-SCROLL
- DECISION: Estrategia reencuentro
- REASON: Arquitectura CONTROL
- UNCERTAINTY: HIGH
- SYSTEM RESPONSE: feed reorder posible
- NEXT STEP: locate or fail
- ERROR: SIM-ERR-1
- RECOVERY: PARTIALLY_RECOVERED

## Interactions log
- INT-001: TYPE=NAV; TARGET=Home; PURPOSE=ENTRY; RESULT=Home loaded
- INT-002: TYPE=SCROLL; TARGET=Home feed; PURPOSE=DISCOVERY; RESULT=Candidates visible
- INT-003: TYPE=CLICK; TARGET=OfferCard; PURPOSE=OPEN_DETAIL; RESULT=Navigate /oferta/[id]
- INT-004: TYPE=SCROLL; TARGET=scroll feed; PURPOSE=REENCUENTRO; RESULT=Attempt locate

## Decisions log
- DEC-D1: OPTIONS=[vitales, top, latest, personalized?, categoria]; CHOSEN=vitales|latest; REASON=Sesgo USER-H; CONFIDENCE=MEDIUM
- DEC-06: OPTIONS=[ignorar, abrir, votar en card, fav en card]; CHOSEN=abrir; REASON=Primera card que llama atencion; CONFIDENCE=MEDIUM

## Potential abandonment
- POTENTIAL ABANDONMENT: step~4; motive=No encuentra oferta tras scroll; severity=MEDIUM; evidence=E2

## Friction hypotheses (E2)
- Sin historial dedicado - reencuentro fragil

## Time
TIME = UNKNOWN - sin fundamento OBSERVED; no se inventan segundos. Candidates: network feed, navigation, decision gap, loading.

## Agents (roles consultados en diseno de esta corrida)
AGENT-12, AGENT-01, AGENT-03, AGENT-05, AGENT-06, AGENT-09, AGENT-10

## Independence note
Corrida generada de forma aislada USER×TASK sin leer outcomes de otras celdas como evidencia.

---
*Fin corrida SIMULATED E2.*
