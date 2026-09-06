# SIM-TASK-010-USER-J-E2

**Evidence:** E2 Simulation  
**Label:** `SIMULATED` - **NO** es comportamiento de usuarios reales (no E4/E5).

| Campo | Valor |
|---|---|
| SIMULATION-ID | SIM-TASK-010-USER-J-E2 |
| USER | USER-J - Orientado a eficiencia |
| TASK | TASK-010 - Publicar |
| ENTRY | `/` (salvo gates) |
| INITIAL STATE | auth_assumption=auth; device=unspecified |
| OUTCOME | SUCCESS |
| SIM-ERR | SIM-ERR-0 |
| SIMULATED COGNITIVE LOAD = HIGH | (cualitativo) |
| TIME | UNKNOWN |
| INTERACTION COUNT | 4 (SIMULATED) |
| DECISION COUNT | 0 (SIMULATED) |
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

### Step 2 - ACTION
- SCREEN: Upload modal (ActionBar)
- VISIBLE INFORMATION: Gate URL parse-offer-url; form; upload images
- USER INTERPRETATION: Completar campos; movil steps 1/2 vs desktop columnas.
- ACTION: Gate URL → form → POST /api/offers
- INTERACTION TYPE: INT-INPUT + INT-SUBMIT
- DECISION: Enviar oferta
- REASON: Objetivo publisher
- UNCERTAINTY: HIGH
- SYSTEM RESPONSE: POST /api/offers; posible 409 duplicate; cooldown
- NEXT STEP: created|error
- ERROR: SIM-ERR-0
- RECOVERY: n/a

## Interactions log
- INT-001: TYPE=NAV; TARGET=Home; PURPOSE=ENTRY; RESULT=Home loaded
- INT-002: TYPE=CLICK; TARGET=Subir; PURPOSE=PUBLISH; RESULT=Open modal
- INT-003: TYPE=INPUT; TARGET=Offer form; PURPOSE=PUBLISH; RESULT=Fields filled
- INT-004: TYPE=SUBMIT; TARGET=Create offer; PURPOSE=PUBLISH; RESULT=POST /api/offers

## Decisions log

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
