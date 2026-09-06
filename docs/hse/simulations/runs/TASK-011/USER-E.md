# SIM-TASK-011-USER-E-E2

**Evidence:** E2 Simulation  
**Label:** `SIMULATED` - **NO** es comportamiento de usuarios reales (no E4/E5).

| Campo | Valor |
|---|---|
| SIMULATION-ID | SIM-TASK-011-USER-E-E2 |
| USER | USER-E - Usuario recurrente |
| TASK | TASK-011 - Revisar oferta propia |
| ENTRY | `/` (salvo gates) |
| INITIAL STATE | auth_assumption=auth; device=unspecified |
| OUTCOME | SUCCESS |
| SIM-ERR | SIM-ERR-0 |
| SIMULATED COGNITIVE LOAD = LOW | (cualitativo) |
| TIME | UNKNOWN |
| INTERACTION COUNT | 2 (SIMULATED) |
| DECISION COUNT | 0 (SIMULATED) |
| ERROR COUNT | 0 (SIMULATED) |
| BACKTRACK COUNT | 0 (SIMULATED) |
| RECOVERY COUNT | 0 (SIMULATED) |

## Shell / navegacion (CONTROL)
- Nav: ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta)
- Search: Search disponible en Home
- Rail: Rail tiendas solo xl

## Attention model (hipotesis E2)
- Home ATTENTION-1: para_ti_tab
- Home ATTENTION-2: known_paths
- Home ATTENTION-3 (posible ignore): onboarding_copy
- Detail ATTENTION-1/2/3: titulo/imagen / CTA outbound / affiliate disclosure / condiciones (posible ignore)

## Trust
- TRUST SIGNALS AVAILABLE: precio, descuento, tienda, votos, imagen, autor
- TRUST QUESTIONS: n/a en esta corrida
- No se afirma que el usuario "confia".

## Steps

### Step 1 - ENTRY
- SCREEN: /
- VISIBLE INFORMATION: Home CONTROL; ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta); Search disponible en Home
- USER INTERPRETATION: Usuario recurrente: interpreta Home como punto de partida para ofertas.
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
- SCREEN: /me
- VISIBLE INFORMATION: Lista ofertas propias / estados (detalle labels: UNKNOWN runtime)
- USER INTERPRETATION: Busca status pending/approved/rejected.
- ACTION: Leer estado
- INTERACTION TYPE: INT-SCROLL
- DECISION: Identificar oferta
- REASON: Seguimiento
- UNCERTAINTY: MEDIUM - labels exactos UNKNOWN
- SYSTEM RESPONSE: /me page
- NEXT STEP: SUCCESS
- ERROR: SIM-ERR-0
- RECOVERY: n/a

## Interactions log
- INT-001: TYPE=NAV; TARGET=Home; PURPOSE=ENTRY; RESULT=Home loaded
- INT-002: TYPE=NAV; TARGET=/me; PURPOSE=ME; RESULT=View own offers

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
