/**
 * Registro de experimentos de activación. No asigna variantes ni guarda resultados.
 * El éxito se lee de las métricas de crecimiento, no de clics.
 */
export const HUNTER_GROWTH_EXPERIMENTS = [
  {
    id: 'zero-offer-composer',
    hypothesis: 'Abrir el envío canónico sin ofertas previas expresa intención de cazador.',
    surface: 'composer',
    target: 'Usuario registrado sin ofertas',
    success: 'Intención de cazador, cuando el evento cubre la ventana',
    guardrail: 'Tasa de rechazo humana',
    state: 'active',
    owner: 'owner',
  },
  {
    id: 'post-approval-second-hunt',
    hypothesis: 'Después de la primera oferta aprobada, pedir otra cacería distinta sube la segunda contribución.',
    surface: '/me',
    target: 'Humano con una oferta aprobada y ninguna pendiente',
    success: 'Segunda contribución distinta',
    guardrail: 'Tasa de rechazo humana',
    state: 'active',
    owner: 'owner',
  },
] as const;
