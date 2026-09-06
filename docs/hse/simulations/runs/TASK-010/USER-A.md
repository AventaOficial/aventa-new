# SIM-TASK-010-USER-A-E2

**Evidence:** E2 Simulation  
**Label:** `SIMULATED` - **NO** es comportamiento de usuarios reales (no E4/E5).

| Campo | Valor |
|---|---|
| SIMULATION-ID | SIM-TASK-010-USER-A-E2 |
| USER | USER-A - Usuario completamente nuevo |
| TASK | TASK-010 - Publicar |
| ENTRY | `/` (salvo gates) |
| INITIAL STATE | auth_assumption=anon; device=unspecified |
| OUTCOME | PARTIAL |
| SIM-ERR | SIM-ERR-1 |
| SIMULATED COGNITIVE LOAD = HIGH | (cualitativo) |
| TIME | UNKNOWN |
| INTERACTION COUNT | 2 (SIMULATED) |
| DECISION COUNT | 0 (SIMULATED) |
| ERROR COUNT | 1 (SIMULATED) |
| BACKTRACK COUNT | 0 (SIMULATED) |
| RECOVERY COUNT | 1 (SIMULATED) |

## Shell / navegacion (CONTROL)
- Nav: ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta)
- Search: Search disponible en Home
- Rail: Rail tiendas solo xl

## Attention model (hipotesis E2)
- Home ATTENTION-1: brand
- Home ATTENTION-2: first_cards
- Home ATTENTION-3 (posible ignore): vote_weights
- Detail ATTENTION-1/2/3: titulo/imagen / CTA outbound / affiliate disclosure / condiciones (posible ignore)

## Trust
- TRUST SIGNALS AVAILABLE: precio, descuento, tienda, votos, imagen, autor
- TRUST QUESTIONS: n/a en esta corrida
- No se afirma que el usuario "confia".

## Steps

### Step 1 - ENTRY
- SCREEN: /
- VISIBLE INFORMATION: Home CONTROL; ActionBar segun viewport (UNKNOWN exacto en simulacion abstracta); Search disponible en Home
- USER INTERPRETATION: Usuario completamente nuevo: interpreta Home como punto de partida para ofertas.
- ACTION: Orientarse
- INTERACTION TYPE: INT-NAV (load)
- DECISION: Continuar exploracion
- REASON: Modelo de entrada baseline
- UNCERTAINTY: HIGH - no conoce tabs/ranking
- SYSTEM RESPONSE: Feed load GET /api/feed/home (o ranked search si busca)
- NEXT STEP: DISCOVERY
- ERROR: SIM-ERR-0
- RECOVERY: n/a

### Step 2 - ACTION
- SCREEN: ActionBar
- VISIBLE INFORMATION: Subir
- USER INTERPRETATION: Quiere publicar; se abre register modal.
- ACTION: Tap Subir
- INTERACTION TYPE: INT-CLICK
- DECISION: Publicar
- REASON: Crear oferta
- UNCERTAINTY: HIGH
- SYSTEM RESPONSE: openRegisterModal
- NEXT STEP: auth
- ERROR: SIM-ERR-1
- RECOVERY: RECOVERED si completa signup

## Interactions log
- INT-001: TYPE=NAV; TARGET=Home; PURPOSE=ENTRY; RESULT=Home loaded
- INT-002: TYPE=CLICK; TARGET=Subir; PURPOSE=PUBLISH; RESULT=Auth modal

## Decisions log

## Potential abandonment
- Ninguno destacado en esta corrida (E2).

## Friction hypotheses (E2)
- Publicacion requiere auth antes del formulario completo

## Time
TIME = UNKNOWN - sin fundamento OBSERVED; no se inventan segundos. Candidates: network feed, navigation, decision gap, loading.

## Agents (roles consultados en diseno de esta corrida)
AGENT-12, AGENT-01, AGENT-03, AGENT-05, AGENT-06, AGENT-09, AGENT-10

## Independence note
Corrida generada de forma aislada USER×TASK sin leer outcomes de otras celdas como evidencia.

---
*Fin corrida SIMULATED E2.*
