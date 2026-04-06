export type AffiliateProgramId =
  | 'mercadolibre'
  | 'amazon'
  | 'aliexpress'
  | 'temu'
  | 'walmart'
  | 'shein';

export type AffiliateProgramCatalogItem = {
  id: AffiliateProgramId;
  name: string;
  description: string;
  dashboardUrl: string;
  onboardingHint: string;
  envKeys: string[];
};

export const AFFILIATE_PROGRAMS_CATALOG: AffiliateProgramCatalogItem[] = [
  {
    id: 'mercadolibre',
    name: 'Mercado Libre',
    description:
      'Normaliza ML/meli.la. Opción A: ?tag= (ML_AFFILIATE_TAG). Opción B: colaborador/perfil con matt_word + matt_tool (ML_MATT_WORD / ML_MATT_TOOL). Pueden usarse ambas si ML lo admite en tu cuenta.',
    dashboardUrl: 'https://www.mercadolibre.com.mx/afiliados',
    onboardingHint:
      'Afiliados clásicos: ML_AFFILIATE_TAG. Cuenta colaborador (compartir sin ?tag=): ML_MATT_WORD + ML_MATT_TOOL (mismos valores que al compartir desde ML). NEXT_PUBLIC_* si el cliente debe armar el enlace.',
    envKeys: [
      'ML_AFFILIATE_TAG',
      'NEXT_PUBLIC_ML_AFFILIATE_TAG',
      'ML_MATT_WORD',
      'NEXT_PUBLIC_ML_MATT_WORD',
      'ML_MATT_TOOL',
      'NEXT_PUBLIC_ML_MATT_TOOL',
    ],
  },
  {
    id: 'amazon',
    name: 'Amazon Associates',
    description:
      'La app aplica ?tag=tracking-id en enlaces de Amazon al guardar/aprobar y al abrir enlaces desde cliente.',
    dashboardUrl: 'https://affiliate-program.amazon.com/',
    onboardingHint:
      'Usa el Tracking ID activo en AMAZON_ASSOCIATE_TAG y NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG.',
    envKeys: ['AMAZON_ASSOCIATE_TAG', 'NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG'],
  },
  {
    id: 'aliexpress',
    name: 'AliExpress',
    description:
      'Si existe afiliación activa, la app agrega aff_fcid (y aff_platform por compatibilidad) a enlaces AliExpress.',
    dashboardUrl: 'https://portals.aliexpress.com/',
    onboardingHint:
      'Solo activar cuando el programa te entregue un aff_fcid válido (ALIEXPRESS_AFF_FCID / NEXT_PUBLIC_ALIEXPRESS_AFF_FCID).',
    envKeys: ['ALIEXPRESS_AFF_FCID', 'NEXT_PUBLIC_ALIEXPRESS_AFF_FCID'],
  },
  {
    id: 'temu',
    name: 'Temu',
    description:
      'La app puede aplicar rp_pid a enlaces de Temu cuando el canal esté aprobado en su panel de partners.',
    dashboardUrl: 'https://creator.temu.com/',
    onboardingHint:
      'Si tu dominio aún no aparece en su selector de canal, dejar inactivo hasta aprobación y luego definir TEMU_AFFILIATE_RP_PID.',
    envKeys: ['TEMU_AFFILIATE_RP_PID', 'NEXT_PUBLIC_TEMU_AFFILIATE_RP_PID'],
  },
  {
    id: 'walmart',
    name: 'Walmart',
    description:
      'La app permite inyectar query afiliada completa para dominios Walmart (ej. wmlspartner=...&sourceid=...).',
    dashboardUrl: 'https://affiliates.walmart.com/',
    onboardingHint:
      'Define WALMART_AFFILIATE_QUERY y NEXT_PUBLIC_WALMART_AFFILIATE_QUERY con los parámetros del programa.',
    envKeys: ['WALMART_AFFILIATE_QUERY', 'NEXT_PUBLIC_WALMART_AFFILIATE_QUERY'],
  },
  {
    id: 'shein',
    name: 'Shein',
    description:
      'La app agrega aff_id cuando está configurado para conservar tracking estándar de afiliados en enlaces Shein.',
    dashboardUrl: 'https://affiliate.shein.com/',
    onboardingHint:
      'Definir SHEIN_AFF_ID y/o NEXT_PUBLIC_SHEIN_AFF_ID solo cuando el programa esté activo para tu cuenta.',
    envKeys: ['SHEIN_AFF_ID', 'NEXT_PUBLIC_SHEIN_AFF_ID'],
  },
];

export type AffiliateProgramRuntimeStatus = {
  id: AffiliateProgramId;
  name: string;
  description: string;
  dashboardUrl: string;
  onboardingHint: string;
  active: boolean;
  configuredKeys: string[];
  missingKeys: string[];
};

function hasEnvValue(key: string): boolean {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function mercadoLibreAffiliateActive(): boolean {
  const hasTag =
    hasEnvValue('ML_AFFILIATE_TAG') || hasEnvValue('NEXT_PUBLIC_ML_AFFILIATE_TAG');
  const hasMattW =
    hasEnvValue('ML_MATT_WORD') || hasEnvValue('NEXT_PUBLIC_ML_MATT_WORD');
  const hasMattT =
    hasEnvValue('ML_MATT_TOOL') || hasEnvValue('NEXT_PUBLIC_ML_MATT_TOOL');
  return hasTag || (hasMattW && hasMattT) || hasMattT;
}

export function getAffiliateProgramsRuntimeStatus(): AffiliateProgramRuntimeStatus[] {
  return AFFILIATE_PROGRAMS_CATALOG.map((item) => {
    const configuredKeys = item.envKeys.filter((k) => hasEnvValue(k));
    const missingKeys = item.envKeys.filter((k) => !configuredKeys.includes(k));
    const active =
      item.id === 'mercadolibre'
        ? mercadoLibreAffiliateActive()
        : configuredKeys.length > 0;
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      dashboardUrl: item.dashboardUrl,
      onboardingHint: item.onboardingHint,
      active,
      configuredKeys,
      missingKeys,
    };
  });
}
