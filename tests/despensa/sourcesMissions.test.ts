import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUNTER_SOURCES } from '@/lib/hunter/sources';
import {
  DESPENSA_SOURCES,
  despensaSourceForUrl,
  isSourceVerifiedForDiscovery,
} from '@/lib/despensa/sources';
import {
  buildDespensaMissions,
  checkMissionCandidate,
  DESPENSA_MISSIONS_ENABLED,
} from '@/lib/despensa/missions';

describe('registro de fuentes', () => {
  it('enlaza solo ids que existen en HUNTER_SOURCES', () => {
    const known = new Set(HUNTER_SOURCES.map((s) => s.id));
    for (const source of DESPENSA_SOURCES) {
      for (const id of source.hunterSourceIds) expect(known.has(id as never), id).toBe(true);
    }
  });

  it('separa capacidad declarada de verificación: sin prueba no está activa', () => {
    for (const source of DESPENSA_SOURCES) {
      if (!source.verification) expect(isSourceVerifiedForDiscovery(source)).toBe(false);
      if (source.status !== 'discovery_verified') expect(isSourceVerifiedForDiscovery(source)).toBe(false);
    }
    expect(DESPENSA_SOURCES.filter(isSourceVerifiedForDiscovery).map((s) => s.id)).toEqual(['mercadolibre_mx']);
  });

  it('Tiendas 3B queda en investigación, sin adaptador ni acceso implementado', () => {
    const b3 = DESPENSA_SOURCES.find((s) => s.id === 'tiendas_3b_mx');
    expect(b3).toMatchObject({ status: 'pending_research', hunterSourceIds: [], verification: null });
    expect(b3?.implemented).toEqual({ discovery: false, originalPrice: false, affiliate: false });
  });

  it('identifica la tienda por dominio exacto o subdominio, no por coincidencia parcial', () => {
    expect(despensaSourceForUrl('https://www.walmart.com.mx/ip/1')?.id).toBe('walmart_mx');
    expect(despensaSourceForUrl('https://articulo.mercadolibre.com.mx/MLM-1')?.id).toBe('mercadolibre_mx');
    expect(despensaSourceForUrl('https://walmart.com.mx.estafa.io/x')).toBeNull();
    expect(despensaSourceForUrl('no es url')).toBeNull();
    expect(despensaSourceForUrl(null)).toBeNull();
  });
});

describe('misiones de Despensa', () => {
  const missions = buildDespensaMissions();

  it('existen como contrato desactivado, solo candidatos y con moderación humana', () => {
    expect(DESPENSA_MISSIONS_ENABLED).toBe(false);
    expect(missions.length).toBeGreaterThan(0);
    for (const mission of missions) {
      expect(mission.writeMode).toBe('candidates_only');
      expect(mission.requiresHumanModeration).toBe(true);
      expect(mission.allowedSourceIds).not.toContain('tiendas_3b_mx');
      expect(mission.allowedSourceIds).not.toContain('soriana_mx');
      expect(mission.allowedSourceIds).not.toContain('amazon_mx');
    }
  });

  it('Amazon PA-API figura como retirada, sin acceso vigente', () => {
    const amazon = DESPENSA_SOURCES.find((s) => s.id === 'amazon_mx');
    expect(amazon).toMatchObject({ status: 'api_retired', accessMethod: 'none', verification: null });
    expect(amazon?.implemented.discovery).toBe(false);
  });

  it('no están conectadas a MCP ni al pipeline de publicación', () => {
    const mcp = readFileSync(join(process.cwd(), 'app/api/mcp/route.ts'), 'utf8');
    expect(mcp).not.toMatch(/despensa/i);
    const src = readFileSync(join(process.cwd(), 'lib/despensa/missions.ts'), 'utf8');
    expect(src).not.toMatch(/from '@\/lib\/(supabase|bots|hunter\/ingest|offers\/ingest)/);
  });

  it('rechaza candidatos que intentan publicar o salen de la misión', () => {
    const base = {
      missionId: 'despensa:alimentos.arroz',
      needId: 'alimentos.arroz',
      url: 'https://www.walmart.com.mx/ip/arroz',
      title: 'Arroz 1 kg',
      price: 30,
      observedAt: '2026-10-11T10:00:00Z',
    };
    expect(checkMissionCandidate(base, missions)).toEqual({ ok: true, sourceId: 'walmart_mx' });
    expect(checkMissionCandidate({ ...base, status: 'approved' }, missions)).toEqual({ ok: false, reason: 'publish_not_allowed' });
    expect(checkMissionCandidate({ ...base, needId: 'alimentos.frijol' }, missions)).toEqual({ ok: false, reason: 'need_mismatch' });
    expect(checkMissionCandidate({ ...base, price: 0 }, missions)).toEqual({ ok: false, reason: 'invalid_price' });
    expect(checkMissionCandidate({ ...base, url: 'https://tiendas3b.com/arroz' }, missions)).toEqual({ ok: false, reason: 'source_not_allowed' });
    expect(checkMissionCandidate({ ...base, missionId: 'despensa:nada' }, missions)).toEqual({ ok: false, reason: 'unknown_mission' });
  });
});
