# SIM-TASK-003-USER-G-E2

**Evidence:** E2 Simulation  
**Label:** `SIMULATED` - **NO** es comportamiento de usuarios reales (no E4/E5).

| Campo | Valor |
|---|---|
| SIMULATION-ID | SIM-TASK-003-USER-G-E2 |
| USER | USER-G - Baja familiaridad tecnologica |
| TASK | TASK-003 - Evaluar una oferta |
| ENTRY | `/` (salvo gates) |
| INITIAL STATE | auth_assumption=anon; device=mobile |
| OUTCOME | SUCCESS |
| SIM-ERR | SIM-ERR-0 |
| SIMULATED COGNITIVE LOAD = HIGH | (cualitativo) |
| TIME | UNKNOWN |
| INTERACTION COUNT | 4 (SIMULATED) |
| DECISION COUNT | 3 (SIMULATED) |
| ERROR COUNT | 0 (SIMULATED) |
| BACKTRACK COUNT | 0 (SIMULATED) |
| RECOVERY COUNT | 0 (SIMULATED) |

## Shell / navegacion (CONTROL)
- Nav: ActionBar tabbar (Inicio, Guia, Subir, Favoritos, Perfil) - Plaza no visible
- Search: Search en Hero (md:hidden)
- Rail: HomeDesktopRail no visible

## Attention model (hipotesis E2)
- Home ATTENTION-1: large_buttons
- Home ATTENTION-2: images
- Home ATTENTION-3 (posible ignore): secondary_meta
- Detail ATTENTION-1/2/3: titulo/imagen / CTA outbound / affiliate disclosure / condiciones (posible ignore)

## Trust
- TRUST SIGNALS AVAILABLE: precio, descuento, tienda, votos, imagen, autor
- TRUST QUESTIONS: El descuento es creible? | La tienda es conocida? | Los votos bastan como prueba?
- No se afirma que el usuario "confia".

## Steps

### Step 1 - ENTRY
- SCREEN: /
- VISIBLE INFORMATION: Home CONTROL; ActionBar tabbar (Inicio, Guia, Subir, Favoritos, Perfil) - Plaza no visible; Search en Hero (md:hidden)
- USER INTERPRETATION: Baja familiaridad tecnologica: interpreta Home como punto de partida para ofertas.
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
- VISIBLE INFORMATION: Cards OfferCard; tabs; ATTENTION-1=large_buttons; ATTENTION-2=images; ATTENTION-3(posible ignore)=secondary_meta
- USER INTERPRETATION: Cree que puede scrollear/filtrar/abrir cards. Prioriza: large_buttons, images. Puede ignorar: secondary_meta, keyboard_hints.
- ACTION: Scroll + inspeccionar cards
- INTERACTION TYPE: INT-SCROLL
- DECISION: Usar modo vitales|latest
- REASON: Perfil USER-G
- UNCERTAINTY: HIGH
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

### Step 4 - EVALUATION
- SCREEN: /oferta/[id]
- VISIBLE INFORMATION: Precio, descuento, tienda, votos, texto. ATTENTION: titulo/imagen, CTA outbound; posible ignore affiliate disclosure / condiciones (posible ignore)
- USER INTERPRETATION: Forma juicio vale/no vale/inseguro (no persistido en sistema).
- ACTION: Leer senales
- INTERACTION TYPE: INT-SCROLL
- DECISION: Evaluar holistico
- REASON: Sesgo USER-G
- UNCERTAINTY: MEDIUM
- SYSTEM RESPONSE: UI estatica + opcional price insight
- NEXT STEP: DECISION interna
- ERROR: SIM-ERR-0
- RECOVERY: n/a

## Interactions log
- INT-001: TYPE=NAV; TARGET=Home; PURPOSE=ENTRY; RESULT=Home loaded
- INT-002: TYPE=SCROLL; TARGET=Home feed; PURPOSE=DISCOVERY; RESULT=Candidates visible
- INT-003: TYPE=CLICK; TARGET=OfferCard; PURPOSE=OPEN_DETAIL; RESULT=Navigate /oferta/[id]
- INT-004: TYPE=SCROLL; TARGET=Offer detail; PURPOSE=EVALUATION; RESULT=Info scanned

## Decisions log
- DEC-D1: OPTIONS=[vitales, top, latest, personalized?, categoria]; CHOSEN=vitales|latest; REASON=Sesgo USER-G; CONFIDENCE=MEDIUM
- DEC-06: OPTIONS=[ignorar, abrir, votar en card, fav en card]; CHOSEN=abrir; REASON=Primera card que llama atencion; CONFIDENCE=MEDIUM
- DEC-09: OPTIONS=[vale, no vale, inseguro]; CHOSEN=inseguro o vale; REASON=Simulacion cualitativa; CONFIDENCE=LOW

## Potential abandonment
- POTENTIAL ABANDONMENT: step~2; motive=Overload de cards/tabs sin modelo mental (hipotesis); severity=MEDIUM; evidence=E2

## Friction hypotheses (E2)
- Multiples tabs sin explicacion → incertidumbre alta para novatos

## Time
TIME = UNKNOWN - sin fundamento OBSERVED; no se inventan segundos. Candidates: network feed, navigation, decision gap, loading.

## Agents (roles consultados en diseno de esta corrida)
AGENT-12, AGENT-01, AGENT-03, AGENT-05, AGENT-06, AGENT-09, AGENT-10

## Independence note
Corrida generada de forma aislada USER×TASK sin leer outcomes de otras celdas como evidencia.

---
*Fin corrida SIMULATED E2.*
