/**
 * Las mutaciones de membresía exigen `requireOwner`.
 * No hay primitiva de reautenticación, step-up ni AAL2 en el servidor.
 * No se inventa una cookie de “sesión reciente”: no probaría nada.
 * Cuando exista, el team gate y estas mutaciones deben usarla sin reescribir el catálogo.
 */
export const TEAM_MANAGEMENT_STEP_UP = {
  enforced: false,
  gate: 'requireOwner',
} as const;
