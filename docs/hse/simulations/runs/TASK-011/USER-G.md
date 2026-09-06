# SIM-TASK-011-USER-G-E2

**Evidence:** E2 Simulation  
**Label:** `SIMULATED` - **NO** es comportamiento de usuarios reales (no E4/E5).

| Campo | Valor |
|---|---|
| SIMULATION-ID | SIM-TASK-011-USER-G-E2 |
| USER | USER-G - Baja familiaridad tecnologica |
| TASK | TASK-011 - Revisar oferta propia |
| ENTRY | `/` (salvo gates) |
| INITIAL STATE | auth_assumption=anon; device=mobile |
| OUTCOME | FAILURE |
| SIM-ERR | SIM-ERR-3 |
| SIMULATED COGNITIVE LOAD = HIGH | (cualitativo) |
| TIME | UNKNOWN |
| INTERACTION COUNT | 2 (SIMULATED) |
| DECISION COUNT | 0 (SIMULATED) |
| ERROR COUNT | 1 (SIMULATED) |
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
- TRUST QUESTIONS: n/a en esta corrida
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

### Step 2 - ACTION
- SCREEN: /me
- VISIBLE INFORMATION: Middleware gate
- USER INTERPRETATION: Intenta ver ofertas propias; redirect home.
- ACTION: Navigate /me
- INTERACTION TYPE: INT-NAV
- DECISION: Ver estado
- REASON: Seguimiento publicacion
- UNCERTAINTY: HIGH
- SYSTEM RESPONSE: redirect /
- NEXT STEP: home
- ERROR: SIM-ERR-3
- RECOVERY: FAILED sin auth

## Interactions log
- INT-001: TYPE=NAV; TARGET=Home; PURPOSE=ENTRY; RESULT=Home loaded
- INT-002: TYPE=NAV; TARGET=/me; PURPOSE=ME; RESULT=Blocked

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
