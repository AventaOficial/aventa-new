import { z } from 'zod';
import { DEFAULT_MAX_SAME_PRODUCT } from '@/lib/offers/feedDiversity';

export const CONTROL_DOMAINS = ['feed_presentation', 'store_profile', 'ad_campaign', 'discovery_agent'] as const;
export type ControlDomain = (typeof CONTROL_DOMAINS)[number];

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(300)
  .refine((value) => value.startsWith('https://'), 'La URL debe usar https');

/**
 * Día a día ya recorta por la ventana de una semana del feed (`resolveHomeFeedPeriod`).
 * Un número de horas no se mapea a esa ventana sin cambiar qué ofertas entran.
 * Hasta definir esa semántica, este dominio solo persiste el tope de repetición.
 */
export const feedPresentationSchema = z
  .object({
    maxSameProduct: z.number().int().min(1).max(4).default(DEFAULT_MAX_SAME_PRODUCT),
  })
  .strict();

export const storeProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    description: z.string().trim().max(280).default(''),
    destinationUrl: httpsUrl,
    active: z.boolean(),
  })
  .strict();

export const adCampaignSchema = z
  .object({
    kind: z.enum(['house', 'paid']),
    title: z.string().trim().min(2).max(80),
    description: z.string().trim().max(180).default(''),
    destinationUrl: z.union([httpsUrl, z.string().trim().regex(/^\/[A-Za-z0-9/_-]{1,120}$/)]),
    startsAt: z.string().datetime().nullable().default(null),
    endsAt: z.string().datetime().nullable().default(null),
    status: z.enum(['draft', 'active', 'ended']),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'paid' && value.status === 'active' && (!value.startsAt || !value.endsAt)) {
      ctx.addIssue({ code: 'custom', message: 'Una campaña pagada activa necesita inicio y fin.' });
    }
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({ code: 'custom', message: 'La fecha de fin debe ser posterior al inicio.' });
    }
  });

export const discoveryAgentSchema = z
  .object({
    displayName: z.string().trim().min(2).max(40),
    agentType: z.enum(['editorial', 'supply', 'future']),
    enabled: z.boolean(),
    sources: z.array(z.string().trim().min(2).max(40)).max(12),
    categories: z.array(z.string().trim().min(2).max(40)).max(12),
  })
  .strict();

const SCHEMAS = {
  feed_presentation: feedPresentationSchema,
  store_profile: storeProfileSchema,
  ad_campaign: adCampaignSchema,
  discovery_agent: discoveryAgentSchema,
} as const;

const BLOCKED = /money|reward|payout|commission|rls|freeze|secret|token|credential|service_role/i;

export type ControlWrite = {
  domain: ControlDomain;
  recordKey: string;
  payload: unknown;
};

export function parseControlWrite(input: unknown): { ok: true; value: ControlWrite } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Cuerpo inválido' };
  const raw = input as { domain?: unknown; recordKey?: unknown; payload?: unknown };
  if (typeof raw.domain !== 'string' || !CONTROL_DOMAINS.includes(raw.domain as ControlDomain)) {
    return { ok: false, error: 'Dominio no permitido' };
  }
  if (typeof raw.recordKey !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,64}$/.test(raw.recordKey)) {
    return { ok: false, error: 'Clave inválida' };
  }
  if (BLOCKED.test(raw.domain) || BLOCKED.test(raw.recordKey) || BLOCKED.test(JSON.stringify(raw.payload ?? ''))) {
    return { ok: false, error: 'Esa configuración no se administra desde este panel' };
  }
  const domain = raw.domain as ControlDomain;
  const parsed = SCHEMAS[domain].safeParse(raw.payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  return { ok: true, value: { domain, recordKey: raw.recordKey, payload: parsed.data } };
}

export const DEFAULT_FEED_PRESENTATION = feedPresentationSchema.parse({});
