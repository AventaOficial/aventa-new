import { PENDING_STALE_AFTER_HOURS, isStrongProductFingerprint } from '@/lib/offers/findDuplicateOffer';
import { parseBotIngestScore } from './confidenceBadge';
import { parseBotMeta } from './botFacts';

/**
 * Clasificación DERIVADA del estado de una oferta pending. No existe en DB y no
 * se persiste: se recalcula al leer. Cambiar de opinión no requiere migración.
 */
export type PendingLifecycleState =
  | 'pending_fresh'
  | 'pending_stale'
  | 'pending_expiring'
  | 'pending_expired'
  | 'pending_high_quality'
  | 'pending_low_quality'
  | 'pending_duplicate';

/** Recomendación, NO acción. Nada de esto se ejecuta automáticamente. */
export type PendingLifecycleAction = 'KEEP' | 'PRIORITIZE' | 'SNOOZE' | 'REVIEW' | 'REJECT';

export type PendingLifecycleThresholds = {
  /** Mismo umbral que usa el hunter para llamar stale a un duplicado pending. */
  staleAfterHours: number;
  /** Una oferta que caduca dentro de esta ventana ya no aguanta otro día en cola. */
  expiringWithinHours: number;
  /** BOT_INGEST_AUTO_APPROVE_MIN_SCORE por defecto. No es un número nuevo. */
  highQualityMinScore: number;
  /** BOT_INGEST_REJECT_BELOW_SCORE por defecto. No es un número nuevo. */
  lowQualityMaxScore: number;
};

export const PENDING_LIFECYCLE_THRESHOLDS: PendingLifecycleThresholds = {
  staleAfterHours: PENDING_STALE_AFTER_HOURS,
  expiringWithinHours: 24,
  highQualityMinScore: 78,
  lowQualityMaxScore: 40,
};

export type PendingLifecycleRow = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  deleted_at?: string | null;
  snoozed_until?: string | null;
  moderator_comment?: string | null;
  product_fingerprint?: string | null;
  bot_meta?: unknown;
};

export type PendingLifecycleClassification = {
  offerId: string;
  state: PendingLifecycleState;
  action: PendingLifecycleAction;
  /** True para stale, high_quality y low_quality: los tres son sub-casos de stale. */
  stale: boolean;
  ageHours: number | null;
  expiresInHours: number | null;
  score: number | null;
  quality: 'high' | 'low' | 'unknown';
  snoozed: boolean;
  /** Por qué salió esta clasificación. Sin esto no es auditable. */
  reasons: string[];
};

function hoursBetween(iso: string | null | undefined, now: Date): number | null {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.round(((ts - now.getTime()) / 3_600_000) * 10) / 10;
}

/**
 * Score ya calculado por el bot. Prioriza bot_meta.score.total y cae al legacy
 * `score=NN` del moderator_comment. No recalcula nada ni llama al Deal Verifier.
 */
export function pendingOfferScore(row: PendingLifecycleRow): number | null {
  const fromMeta = parseBotMeta(row.bot_meta)?.score?.total;
  if (typeof fromMeta === 'number' && Number.isFinite(fromMeta)) return fromMeta;
  return parseBotIngestScore(row.moderator_comment);
}

function qualityFor(
  score: number | null,
  thresholds: PendingLifecycleThresholds
): 'high' | 'low' | 'unknown' {
  if (score == null) return 'unknown';
  if (score >= thresholds.highQualityMinScore) return 'high';
  if (score < thresholds.lowQualityMaxScore) return 'low';
  return 'unknown';
}

const ACTION_BY_STATE: Record<PendingLifecycleState, PendingLifecycleAction> = {
  pending_duplicate: 'REJECT',
  pending_expired: 'REVIEW',
  pending_expiring: 'PRIORITIZE',
  pending_high_quality: 'PRIORITIZE',
  pending_low_quality: 'SNOOZE',
  pending_stale: 'REVIEW',
  pending_fresh: 'KEEP',
};

/**
 * Clasifica UNA oferta pending. Determinista y sin efectos: no escribe, no borra,
 * no consulta la DB. Devuelve null si la fila no es una pending viva.
 *
 * Precedencia (fija, para que dos lecturas del mismo dato den lo mismo):
 * duplicado → caducada → por caducar → stale(alta/baja/desconocida) → fresca.
 * Calidad desconocida nunca se degrada a SNOOZE: fail-closed hacia REVIEW humano.
 */
export function classifyPendingOffer(
  row: PendingLifecycleRow,
  opts: {
    now?: Date;
    thresholds?: PendingLifecycleThresholds;
    /** Duplicado ya confirmado por quien llama (p. ej. colisión de fingerprint). */
    duplicateOf?: string | null;
  } = {}
): PendingLifecycleClassification | null {
  if ((row.status ?? '') !== 'pending') return null;
  if (row.deleted_at) return null;

  const now = opts.now ?? new Date();
  const thresholds = opts.thresholds ?? PENDING_LIFECYCLE_THRESHOLDS;
  const reasons: string[] = [];

  const createdInHours = hoursBetween(row.created_at, now);
  const ageHours = createdInHours == null ? null : Math.max(0, -createdInHours);
  const expiresInHours = hoursBetween(row.expires_at, now);
  const score = pendingOfferScore(row);
  const quality = qualityFor(score, thresholds);
  const snoozed = (() => {
    const t = row.snoozed_until ? Date.parse(row.snoozed_until) : NaN;
    return Number.isFinite(t) && t > now.getTime();
  })();

  const stale = ageHours != null && ageHours >= thresholds.staleAfterHours;

  const state: PendingLifecycleState = (() => {
    if (opts.duplicateOf) {
      reasons.push(`duplicado de ${opts.duplicateOf}`);
      return 'pending_duplicate';
    }
    if (expiresInHours != null && expiresInHours <= 0) {
      reasons.push('vigencia terminada');
      return 'pending_expired';
    }
    if (expiresInHours != null && expiresInHours <= thresholds.expiringWithinHours) {
      reasons.push(`caduca en ${expiresInHours} h`);
      return 'pending_expiring';
    }
    if (stale) {
      reasons.push(`${ageHours} h en cola sin moderar`);
      if (quality === 'high') {
        reasons.push(`score ${score} ≥ ${thresholds.highQualityMinScore}`);
        return 'pending_high_quality';
      }
      if (quality === 'low') {
        reasons.push(`score ${score} < ${thresholds.lowQualityMaxScore}`);
        return 'pending_low_quality';
      }
      reasons.push(score == null ? 'sin score del bot' : `score ${score} en zona media`);
      return 'pending_stale';
    }
    reasons.push(ageHours == null ? 'sin created_at usable' : `${ageHours} h en cola`);
    return 'pending_fresh';
  })();

  if (snoozed) reasons.push('pospuesta por un moderador');

  return {
    offerId: row.id,
    state,
    action: ACTION_BY_STATE[state],
    stale,
    ageHours,
    expiresInHours,
    score,
    quality,
    snoozed,
    reasons,
  };
}

export type PendingHealthSummary = {
  total: number;
  fresh: number;
  stale: number;
  expiring: number;
  expired: number;
  highQualityStale: number;
  lowQualityStale: number;
  duplicate: number;
  snoozed: number;
  byAction: Record<PendingLifecycleAction, number>;
  /** Cuántas exigen atención humana ahora: PRIORITIZE + REVIEW + REJECT. */
  needsAttention: number;
  oldestPendingHours: number | null;
  /** Muestra para abrir en Focus: las de mayor urgencia primero. */
  topAttention: PendingLifecycleClassification[];
};

const ATTENTION_ORDER: PendingLifecycleAction[] = ['PRIORITIZE', 'REJECT', 'REVIEW'];

/**
 * Agrega la cola completa. Detecta duplicados DENTRO del conjunto pending por
 * fingerprint fuerte: la más antigua se conserva, las posteriores son duplicadas.
 * No consulta la DB ni mira ofertas publicadas.
 */
export function summarizePendingLifecycle(
  rows: readonly PendingLifecycleRow[],
  opts: { now?: Date; thresholds?: PendingLifecycleThresholds; topAttentionLimit?: number } = {}
): PendingHealthSummary {
  const now = opts.now ?? new Date();
  const limit = opts.topAttentionLimit ?? 10;

  const firstByFingerprint = new Map<string, { id: string; createdMs: number }>();
  for (const row of rows) {
    if ((row.status ?? '') !== 'pending' || row.deleted_at) continue;
    const fp = row.product_fingerprint;
    if (!isStrongProductFingerprint(fp)) continue;
    const createdMs = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    const ms = Number.isFinite(createdMs) ? createdMs : Number.MAX_SAFE_INTEGER;
    const current = firstByFingerprint.get(fp);
    if (!current || ms < current.createdMs || (ms === current.createdMs && row.id < current.id)) {
      firstByFingerprint.set(fp, { id: row.id, createdMs: ms });
    }
  }

  const summary: PendingHealthSummary = {
    total: 0,
    fresh: 0,
    stale: 0,
    expiring: 0,
    expired: 0,
    highQualityStale: 0,
    lowQualityStale: 0,
    duplicate: 0,
    snoozed: 0,
    byAction: { KEEP: 0, PRIORITIZE: 0, SNOOZE: 0, REVIEW: 0, REJECT: 0 },
    needsAttention: 0,
    oldestPendingHours: null,
    topAttention: [],
  };

  const attention: PendingLifecycleClassification[] = [];

  for (const row of rows) {
    const fp = row.product_fingerprint;
    const keeper = isStrongProductFingerprint(fp) ? firstByFingerprint.get(fp) : undefined;
    const duplicateOf = keeper && keeper.id !== row.id ? keeper.id : null;

    const c = classifyPendingOffer(row, { now, thresholds: opts.thresholds, duplicateOf });
    if (!c) continue;

    summary.total += 1;
    summary.byAction[c.action] += 1;
    if (c.snoozed) summary.snoozed += 1;
    if (c.ageHours != null) {
      summary.oldestPendingHours = Math.max(summary.oldestPendingHours ?? 0, c.ageHours);
    }

    if (c.state === 'pending_fresh') summary.fresh += 1;
    else if (c.state === 'pending_stale') summary.stale += 1;
    else if (c.state === 'pending_expiring') summary.expiring += 1;
    else if (c.state === 'pending_expired') summary.expired += 1;
    else if (c.state === 'pending_duplicate') summary.duplicate += 1;
    else if (c.state === 'pending_high_quality') {
      summary.highQualityStale += 1;
      summary.stale += 1;
    } else if (c.state === 'pending_low_quality') {
      summary.lowQualityStale += 1;
      summary.stale += 1;
    }

    if (ATTENTION_ORDER.includes(c.action)) attention.push(c);
  }

  summary.needsAttention = attention.length;
  summary.topAttention = attention
    .sort((a, b) => {
      const rank = ATTENTION_ORDER.indexOf(a.action) - ATTENTION_ORDER.indexOf(b.action);
      if (rank !== 0) return rank;
      return (b.ageHours ?? 0) - (a.ageHours ?? 0);
    })
    .slice(0, limit);

  return summary;
}
