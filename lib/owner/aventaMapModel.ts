/**
 * Modelo de negocio del Mapa de AVENTA (lenguaje fundador, sin detalle técnico).
 */

export type MapTone = 'green' | 'yellow' | 'red' | 'neutral';

export type MapStep = {
  id: string;
  title: string;
  description: string;
};

export type MapFlowId =
  | 'usuarios'
  | 'ofertas'
  | 'moderacion'
  | 'afiliacion'
  | 'ingresos'
  | 'infraestructura';

export type MapFlowDefinition = {
  id: MapFlowId;
  title: string;
  subtitle: string;
  steps: MapStep[];
  dependsOn: MapFlowId[];
  /** Qué parte del negocio sufre si este flujo falla */
  businessImpact: string;
};

export const MAP_FLOW_DEFINITIONS: MapFlowDefinition[] = [
  {
    id: 'usuarios',
    title: 'Flujo de usuarios',
    subtitle: 'Cómo entra la gente y se queda',
    steps: [
      {
        id: 'u1',
        title: 'Llegada',
        description: 'Home, guía rápida o enlace compartido.',
      },
      {
        id: 'u2',
        title: 'Cuenta',
        description: 'Registro o sesión para votar, guardar y publicar.',
      },
      {
        id: 'u3',
        title: 'Exploración',
        description: 'Feed por día, top, para ti o últimas ofertas.',
      },
      {
        id: 'u4',
        title: 'Participación',
        description: 'Votos, favoritos, comentarios y alertas.',
      },
      {
        id: 'u5',
        title: 'Creación',
        description: 'Usuarios con reputación suben ofertas a la comunidad.',
      },
    ],
    dependsOn: ['infraestructura'],
    businessImpact: 'Sin usuarios activos no hay votos ni clics: el catálogo no se valida.',
  },
  {
    id: 'ofertas',
    title: 'Flujo de ofertas',
    subtitle: 'Del dato al clic en tienda',
    steps: [
      {
        id: 'o1',
        title: 'Origen',
        description: 'Persona, bot de ingesta o equipo interno publica.',
      },
      {
        id: 'o2',
        title: 'Estado',
        description: 'Pendiente de revisión o visible si ya cumple reglas.',
      },
      {
        id: 'o3',
        title: 'Ranking',
        description: 'Votos y reputación ordenan lo que se ve primero.',
      },
      {
        id: 'o4',
        title: 'Interés',
        description: 'Vistas en cards y detalle de oferta.',
      },
      {
        id: 'o5',
        title: 'Salida',
        description: 'Clic «ir a tienda» hacia el enlace de compra.',
      },
    ],
    dependsOn: ['usuarios', 'moderacion', 'infraestructura'],
    businessImpact: 'Sin ofertas frescas y bien rankeadas el feed pierde razón de ser.',
  },
  {
    id: 'moderacion',
    title: 'Flujo de moderación',
    subtitle: 'Calidad antes de publicar',
    steps: [
      {
        id: 'm1',
        title: 'Entrada',
        description: 'Oferta nueva entra a cola (salvo auto-aprobación por reputación o bot).',
      },
      {
        id: 'm2',
        title: 'Revisión',
        description: 'Equipo valida precio, enlace y reglas.',
      },
      {
        id: 'm3',
        title: 'Decisión',
        description: 'Aprobada al feed o rechazada con motivo.',
      },
      {
        id: 'm4',
        title: 'Seguimiento',
        description: 'Reportes de usuarios y comentarios moderados.',
      },
    ],
    dependsOn: ['infraestructura'],
    businessImpact: 'Cola alta o lenta erosiona confianza y retraso de ofertas buenas.',
  },
  {
    id: 'afiliacion',
    title: 'Flujo de afiliación',
    subtitle: 'Monetización por enlaces',
    steps: [
      {
        id: 'a1',
        title: 'Programas',
        description: 'Mercado Libre, Amazon y otras redes si están activas.',
      },
      {
        id: 'a2',
        title: 'Etiquetado',
        description: 'Enlaces llevan parámetros de socio al guardar y al abrir.',
      },
      {
        id: 'a3',
        title: 'Clic',
        description: 'Usuario sale a la tienda desde AVENTA.',
      },
      {
        id: 'a4',
        title: 'Atribución',
        description: 'La red paga según sus reportes (no en tiempo real en la app).',
      },
    ],
    dependsOn: ['ofertas', 'infraestructura'],
    businessImpact: 'Sin tags activos hay tráfico pero poca o ninguna comisión atribuida.',
  },
  {
    id: 'ingresos',
    title: 'Flujo de ingresos',
    subtitle: 'De clic a dinero registrado',
    steps: [
      {
        id: 'i1',
        title: 'Tráfico',
        description: 'Clics salientes medidos en la plataforma.',
      },
      {
        id: 'i2',
        title: 'Reportes',
        description: 'Descargas de paneles de afiliados (ML, Amazon, etc.).',
      },
      {
        id: 'i3',
        title: 'Ledger',
        description: 'Totales importados manualmente al libro interno.',
      },
      {
        id: 'i4',
        title: 'Reparto',
        description: 'Comisiones a creadores: proceso parcial / manual en beta.',
      },
    ],
    dependsOn: ['afiliacion', 'ofertas'],
    businessImpact: 'Clics sin ledger ni tags = ingreso invisible para decisiones.',
  },
  {
    id: 'infraestructura',
    title: 'Infraestructura',
    subtitle: 'Lo que mantiene vivo el sistema',
    steps: [
      {
        id: 'f1',
        title: 'Sitio en línea',
        description: 'App accesible en web y como PWA.',
      },
      {
        id: 'f2',
        title: 'Datos y cuentas',
        description: 'Ofertas, usuarios, votos y archivos.',
      },
      {
        id: 'f3',
        title: 'Protección',
        description: 'Límites de uso y tareas programadas.',
      },
      {
        id: 'f4',
        title: 'Comunicación',
        description: 'Correos de resumen y alertas al equipo.',
      },
      {
        id: 'f5',
        title: 'Abastecimiento',
        description: 'Bot y automatizaciones alimentan el catálogo.',
      },
    ],
    dependsOn: [],
    businessImpact: 'Si la base cae, todo el negocio se detiene de inmediato.',
  },
];

export const MAP_FLOW_LABELS: Record<MapFlowId, string> = {
  usuarios: 'Usuarios',
  ofertas: 'Ofertas',
  moderacion: 'Moderación',
  afiliacion: 'Afiliación',
  ingresos: 'Ingresos',
  infraestructura: 'Infraestructura',
};

export type MapFlowLive = MapFlowDefinition & {
  status: { label: string; tone: MapTone; emoji: string };
  liveSignals: string[];
  healthLine: string;
};

export type AventaMapPayload = {
  generatedAt: string;
  timezone: string;
  headline: string;
  subline: string;
  overallTone: MapTone;
  flows: MapFlowLive[];
  /** Conexiones fundador: de → a */
  links: { from: MapFlowId; to: MapFlowId; label: string }[];
  legend: { emoji: string; label: string }[];
};
