import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAttributionChannel } from '@/lib/attribution/channels';
import { economicIdempotencyKey, projectCommissionLifecycle } from '@/lib/economy/commission/confirmedCommissionGate';
import {
  parseCampaignCookie,
  parseCampaignSearch,
  resolveRequestCampaign,
  serializeCampaignCookie,
} from '@/lib/growth/campaignContext';
import { buildShareUrl } from '@/lib/growth/shareLink';
import { budgetDecision, buildGrowthWarRoomView } from '@/lib/growth/warRoom';
import { rankRetailers } from '@/lib/growth/pacing';

const measured = { visitors: 100, offerViews: 40, outboundClicks: 10 };

describe('growth war room', () => {
  it('A — una campaña de TikTok queda en la cookie y no guarda correo', () => {
    const ctx = parseCampaignSearch('?utm_source=tiktok&utm_medium=paid&utm_campaign=bf26&utm_content=video_017&utm_term=user@mail.com');
    expect(ctx?.source).toBe('tiktok');
    expect(ctx?.campaign).toBe('bf26');
    expect(ctx?.content).toBe('video_017');
    expect(ctx?.term).toBeNull();
    expect(serializeCampaignCookie(ctx!)).not.toContain('@');
  });

  it('B — la cookie sobrevive sin un utm nuevo', () => {
    const first = parseCampaignSearch('?utm_source=tiktok&utm_campaign=bf26&utm_content=video_017');
    const later = parseCampaignCookie(serializeCampaignCookie(first!));
    expect(later).toEqual(first);
  });

  it('C — el enlace compartido conserva la fuente', () => {
    const url = new URL(buildShareUrl('https://aventaofertas.com', '/oferta/demo', 'whatsapp', 'video_017'));
    expect(url.searchParams.get('utm_source')).toBe('whatsapp');
    expect(url.searchParams.get('utm_medium')).toBe('share');
    expect(url.searchParams.get('utm_content')).toBe('video_017');
    expect(resolveAttributionChannel({ utmSource: url.searchParams.get('utm_source') })).toBe('whatsapp');
  });

  it('la landing conserva la campaña cuando el anuncio trae la fuente', () => {
    const ctx = resolveRequestCampaign('?utm_source=tiktok&utm_content=video_017', '/go/bf26');
    expect(ctx?.source).toBe('tiktok');
    expect(ctx?.campaign).toBe('bf26');
    expect(ctx?.content).toBe('video_017');
  });

  it('D — dos campañas de la misma oferta no se mezclan', () => {
    const a = serializeCampaignCookie(parseCampaignSearch('?utm_source=tiktok&utm_campaign=bf26')!);
    const b = serializeCampaignCookie(parseCampaignSearch('?utm_source=instagram&utm_campaign=navidad')!);
    expect(a).not.toBe(b);
    expect(parseCampaignCookie(a)?.campaign).toBe('bf26');
    expect(parseCampaignCookie(b)?.campaign).toBe('navidad');
  });

  it('E — un evento de red duplicado sigue siendo una sola conversión económica', () => {
    const first = economicIdempotencyKey({ kind: 'conversion', source: 'mercadolibre', sourceEventId: 'evt-1' });
    const duplicate = economicIdempotencyKey({ kind: 'conversion', source: 'mercadolibre', sourceEventId: 'evt-1' });
    expect(first).toBe(duplicate);
  });

  it('F — una reversión no se reporta como venta confirmada', () => {
    expect(projectCommissionLifecycle('reversed')).toBe('COMMISSION_REVERSED');
    const room = buildGrowthWarRoomView({
      nowMs: Date.parse('2026-11-15T12:00:00.000Z'),
      conversionConnected: false,
      today: measured,
      d7: measured,
      d30: measured,
      sinceLaunch: measured,
      completenessPct: 0.9,
      outboundVolume: 10,
      attributedClicks: 10,
      byChannel: [],
      byCampaign: [],
      byNetwork: [],
      topOffers: [],
    });
    expect(room.sinceLaunch.confirmedSales).toBeNull();
    expect(room.sinceLaunch.salesLabel).toBe('DATA_INCOMPLETE');
  });

  it('G — sin dato de afiliado el tablero no dice cero', () => {
    const room = buildGrowthWarRoomView({
      nowMs: Date.parse('2026-10-08T12:00:00.000Z'),
      conversionConnected: false,
      today: measured,
      d7: measured,
      d30: measured,
      sinceLaunch: { visitors: null, offerViews: null, outboundClicks: null },
      completenessPct: null,
      outboundVolume: null,
      attributedClicks: null,
      byChannel: [{ channel: 'tiktok', clicks: 4 }],
      byCampaign: [],
      byNetwork: [{ network: 'amazon', clicks: 2 }],
      topOffers: [{ offerId: 'offer-1', clicks: 4 }],
    });
    expect(room.today.confirmedSales).toBeNull();
    expect(room.pace).toBe('DATA_INSUFFICIENT');
    expect(room.projectedFinish).toBeNull();
    expect(room.affiliateConfirmation).toBe('DATA_INCOMPLETE');
    expect(room.channels[0]?.confirmedSales).toBeNull();
    expect(rankRetailers([{ id: 'amazon', clicks: 2, conversions: null }]).insufficient).toEqual(['amazon']);
  });

  it('no llama rentable a una comisión estimada', () => {
    const estimated = budgetDecision({
      spendCents: 1000,
      visitors: 10,
      clicks: 4,
      confirmedSales: null,
      confirmedCommissionCents: null,
      estimatedCommissionCents: 500,
    });
    expect(estimated.commissionKind).toBe('ESTIMATED');
    expect(estimated.roas).toBeNull();
  });

  it('growth no escribe payout ni ledger', () => {
    const files = [
      'lib/growth/warRoom.ts',
      'lib/growth/loadWarRoom.ts',
      'lib/growth/campaignContext.ts',
      'app/admin/owner/crecimiento/war-room/page.tsx',
      'app/api/track-outbound/route.ts',
    ];
    for (const file of files) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src).not.toMatch(/createPayout|payoutIntent|REWARDS_PAYOUT_ENABLED\s*=\s*true|MONEY_PATH_FROZEN\s*=\s*false/);
    }
  });
});
