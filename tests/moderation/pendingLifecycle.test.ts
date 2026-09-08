import { describe, it, expect } from 'vitest';
import {
  classifyPendingOffer,
  pendingOfferScore,
  summarizePendingLifecycle,
  PENDING_LIFECYCLE_THRESHOLDS,
  type PendingLifecycleRow,
} from '@/lib/moderation/pendingLifecycle';
import { isSupplyOpportunity } from '@/lib/offers/supplyOpportunity';

const NOW = new Date('2026-09-08T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function row(over: Partial<PendingLifecycleRow> = {}): PendingLifecycleRow {
  return {
    id: 'offer-1',
    status: 'pending',
    created_at: hoursAgo(2),
    expires_at: null,
    deleted_at: null,
    snoozed_until: null,
    moderator_comment: null,
    product_fingerprint: null,
    bot_meta: null,
    ...over,
  };
}

const botMeta = (total: number) => ({ v: 1, score: { total } });

describe('pending lifecycle: clasificación', () => {
  it('pending reciente = fresh → KEEP', () => {
    const c = classifyPendingOffer(row(), { now: NOW })!;
    expect(c.state).toBe('pending_fresh');
    expect(c.action).toBe('KEEP');
    expect(c.stale).toBe(false);
    expect(c.ageHours).toBe(2);
  });

  it('pending > 72 h sin score = stale → REVIEW', () => {
    const c = classifyPendingOffer(row({ created_at: hoursAgo(100) }), { now: NOW })!;
    expect(c.state).toBe('pending_stale');
    expect(c.action).toBe('REVIEW');
    expect(c.stale).toBe(true);
    expect(c.quality).toBe('unknown');
  });

  it('stale con score alto = high_quality → PRIORITIZE', () => {
    const c = classifyPendingOffer(
      row({ created_at: hoursAgo(100), bot_meta: botMeta(88) }),
      { now: NOW }
    )!;
    expect(c.state).toBe('pending_high_quality');
    expect(c.action).toBe('PRIORITIZE');
    expect(c.stale).toBe(true);
    expect(c.score).toBe(88);
  });

  it('stale con score bajo = low_quality → SNOOZE recomendado', () => {
    const c = classifyPendingOffer(
      row({ created_at: hoursAgo(100), bot_meta: botMeta(21) }),
      { now: NOW }
    )!;
    expect(c.state).toBe('pending_low_quality');
    expect(c.action).toBe('SNOOZE');
  });

  it('score en zona media no degrada a SNOOZE: fail-closed a REVIEW', () => {
    const c = classifyPendingOffer(
      row({ created_at: hoursAgo(100), bot_meta: botMeta(60) }),
      { now: NOW }
    )!;
    expect(c.quality).toBe('unknown');
    expect(c.action).toBe('REVIEW');
  });

  it('caduca pronto = expiring → PRIORITIZE, aunque sea fresca', () => {
    const c = classifyPendingOffer(row({ expires_at: hoursAhead(6) }), { now: NOW })!;
    expect(c.state).toBe('pending_expiring');
    expect(c.action).toBe('PRIORITIZE');
    expect(c.expiresInHours).toBe(6);
  });

  it('vigencia terminada = expired → REVIEW', () => {
    const c = classifyPendingOffer(row({ expires_at: hoursAgo(1) }), { now: NOW })!;
    expect(c.state).toBe('pending_expired');
    expect(c.action).toBe('REVIEW');
  });

  it('duplicado confirmado gana a todo lo demás → REJECT recomendado', () => {
    const c = classifyPendingOffer(
      row({ created_at: hoursAgo(200), expires_at: hoursAgo(1), bot_meta: botMeta(95) }),
      { now: NOW, duplicateOf: 'offer-otra' }
    )!;
    expect(c.state).toBe('pending_duplicate');
    expect(c.action).toBe('REJECT');
    expect(c.reasons.join(' ')).toContain('offer-otra');
  });

  it('rechazadas, aprobadas y borradas no se clasifican', () => {
    expect(classifyPendingOffer(row({ status: 'rejected' }), { now: NOW })).toBeNull();
    expect(classifyPendingOffer(row({ status: 'approved' }), { now: NOW })).toBeNull();
    expect(classifyPendingOffer(row({ deleted_at: hoursAgo(1) }), { now: NOW })).toBeNull();
  });

  it('sin created_at usable no se asume stale', () => {
    const c = classifyPendingOffer(row({ created_at: null }), { now: NOW })!;
    expect(c.ageHours).toBeNull();
    expect(c.stale).toBe(false);
    expect(c.state).toBe('pending_fresh');
  });

  it('snooze activo se reporta pero no cambia el estado', () => {
    const c = classifyPendingOffer(row({ snoozed_until: hoursAhead(3) }), { now: NOW })!;
    expect(c.snoozed).toBe(true);
    expect(c.state).toBe('pending_fresh');
  });

  it('es determinista: dos llamadas al mismo dato dan lo mismo', () => {
    const r = row({ created_at: hoursAgo(100), bot_meta: botMeta(88) });
    expect(classifyPendingOffer(r, { now: NOW })).toEqual(classifyPendingOffer(r, { now: NOW }));
  });

  it('no muta la fila de entrada', () => {
    const r = row({ created_at: hoursAgo(100) });
    const snapshot = JSON.stringify(r);
    classifyPendingOffer(r, { now: NOW });
    expect(JSON.stringify(r)).toBe(snapshot);
  });

  it('reutiliza el score existente: bot_meta primero, luego el legacy del comentario', () => {
    expect(pendingOfferScore(row({ bot_meta: botMeta(77) }))).toBe(77);
    expect(pendingOfferScore(row({ moderator_comment: '[bot-ingest v3] score=64 (auto)' }))).toBe(64);
    expect(pendingOfferScore(row())).toBeNull();
  });

  it('los umbrales son los ya existentes, no números nuevos', () => {
    expect(PENDING_LIFECYCLE_THRESHOLDS.staleAfterHours).toBe(72);
    expect(PENDING_LIFECYCLE_THRESHOLDS.highQualityMinScore).toBe(78);
    expect(PENDING_LIFECYCLE_THRESHOLDS.lowQualityMaxScore).toBe(40);
  });
});

describe('pending lifecycle: resumen de cola', () => {
  it('cuenta cada estado y suma las sub-clases dentro de stale', () => {
    const summary = summarizePendingLifecycle(
      [
        row({ id: 'a' }),
        row({ id: 'b', created_at: hoursAgo(100) }),
        row({ id: 'c', created_at: hoursAgo(100), bot_meta: botMeta(90) }),
        row({ id: 'd', created_at: hoursAgo(100), bot_meta: botMeta(10) }),
        row({ id: 'e', expires_at: hoursAhead(4) }),
        row({ id: 'f', expires_at: hoursAgo(4) }),
      ],
      { now: NOW }
    );

    expect(summary.total).toBe(6);
    expect(summary.fresh).toBe(1);
    expect(summary.highQualityStale).toBe(1);
    expect(summary.lowQualityStale).toBe(1);
    expect(summary.stale).toBe(3);
    expect(summary.expiring).toBe(1);
    expect(summary.expired).toBe(1);
    expect(summary.byAction.KEEP).toBe(1);
    expect(summary.byAction.PRIORITIZE).toBe(2);
    expect(summary.byAction.SNOOZE).toBe(1);
    expect(summary.byAction.REVIEW).toBe(2);
  });

  it('cola vacía: todo en cero y sin atención requerida', () => {
    const summary = summarizePendingLifecycle([], { now: NOW });
    expect(summary.total).toBe(0);
    expect(summary.needsAttention).toBe(0);
    expect(summary.oldestPendingHours).toBeNull();
    expect(summary.topAttention).toEqual([]);
  });

  it('duplicados dentro de la cola: conserva la más antigua, marca las posteriores', () => {
    const summary = summarizePendingLifecycle(
      [
        row({ id: 'vieja', product_fingerprint: 'ml:MLM123', created_at: hoursAgo(10) }),
        row({ id: 'nueva', product_fingerprint: 'ml:MLM123', created_at: hoursAgo(2) }),
        row({ id: 'otra', product_fingerprint: 'ml:MLM999', created_at: hoursAgo(1) }),
      ],
      { now: NOW }
    );
    expect(summary.duplicate).toBe(1);
    expect(summary.byAction.REJECT).toBe(1);
    expect(summary.topAttention[0]!.offerId).toBe('nueva');
  });

  it('fingerprints débiles no generan duplicados', () => {
    const summary = summarizePendingLifecycle(
      [
        row({ id: 'a', product_fingerprint: 'url:tienda.com' }),
        row({ id: 'b', product_fingerprint: 'url:tienda.com' }),
      ],
      { now: NOW }
    );
    expect(summary.duplicate).toBe(0);
  });

  it('topAttention prioriza PRIORITIZE y luego la más vieja', () => {
    const summary = summarizePendingLifecycle(
      [
        row({ id: 'review-viejo', created_at: hoursAgo(500) }),
        row({ id: 'prioritize', created_at: hoursAgo(100), bot_meta: botMeta(90) }),
        row({ id: 'keep', created_at: hoursAgo(1) }),
      ],
      { now: NOW }
    );
    expect(summary.topAttention.map((c) => c.offerId)).toEqual(['prioritize', 'review-viejo']);
    expect(summary.needsAttention).toBe(2);
  });

  it('ignora filas que no son pending vivas', () => {
    const summary = summarizePendingLifecycle(
      [
        row({ id: 'ok' }),
        row({ id: 'rechazada', status: 'rejected' }),
        row({ id: 'borrada', deleted_at: hoursAgo(1) }),
        row({ id: 'publicada', status: 'published' }),
      ],
      { now: NOW }
    );
    expect(summary.total).toBe(1);
  });

  it('no ejecuta acciones: el resumen solo contiene datos, sin mutadores', () => {
    const summary = summarizePendingLifecycle([row({ created_at: hoursAgo(100) })], { now: NOW });
    for (const value of Object.values(summary)) {
      expect(typeof value).not.toBe('function');
    }
  });
});

describe('supply intelligence: solo medición', () => {
  it('mismo producto más barato por encima del umbral = oportunidad', () => {
    expect(isSupplyOpportunity({ candidatePrice: 800, existingPrice: 1000 })).toBe(true);
  });

  it('mejora marginal no cuenta', () => {
    expect(isSupplyOpportunity({ candidatePrice: 980, existingPrice: 1000 })).toBe(false);
  });

  it('más caro o igual no cuenta', () => {
    expect(isSupplyOpportunity({ candidatePrice: 1200, existingPrice: 1000 })).toBe(false);
    expect(isSupplyOpportunity({ candidatePrice: 1000, existingPrice: 1000 })).toBe(false);
  });

  it('fail-closed sin precios utilizables', () => {
    expect(isSupplyOpportunity({ candidatePrice: null, existingPrice: 1000 })).toBe(false);
    expect(isSupplyOpportunity({ candidatePrice: 800, existingPrice: null })).toBe(false);
    expect(isSupplyOpportunity({ candidatePrice: 0, existingPrice: 1000 })).toBe(false);
    expect(isSupplyOpportunity({ candidatePrice: Number.NaN, existingPrice: 1000 })).toBe(false);
  });
});
