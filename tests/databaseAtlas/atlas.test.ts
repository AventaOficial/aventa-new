import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAtlasModel, loadDatabaseAtlas } from '@/lib/databaseAtlas/build';
import { parseMigrationFiles } from '@/lib/databaseAtlas/parseMigrations';

const CONTROL_SQL = readFileSync('docs/supabase-migrations/20261010_operational_control.sql', 'utf8');

describe('generador del atlas', () => {
  it('lee la migración de control sin inventar una finalidad', () => {
    const parsed = parseMigrationFiles([{ name: '20261010_operational_control.sql', sql: CONTROL_SQL }]);
    const controls = parsed.find((item) => item.name === 'operational_controls');
    const audit = parsed.find((item) => item.name === 'operational_control_audit');
    expect(controls).toMatchObject({
      name: 'operational_controls',
      kind: 'table',
      primaryKey: ['domain', 'record_key'],
      rlsEnabled: true,
      purpose: null,
    });
    expect(controls?.columns.map((column) => column.name)).toEqual(['domain', 'record_key', 'payload', 'updated_by', 'updated_at']);
    expect(audit?.name).toBe('operational_control_audit');
    expect(audit?.policies).toEqual([]);
  });

  it('no trata una relación de migración como clave foránea observada', () => {
    const declared = parseMigrationFiles([{
      name: 'demo.sql',
      sql: 'create table public.child (id uuid primary key, parent_id uuid references public.parent(id));',
    }]);
    const model = buildAtlasModel({
      declared,
      production: { environment: 'production', projectRef: 'prod', inspectedAt: '2026-10-10T00:00:00.000Z', objects: [], buckets: [] },
      staging: { environment: 'staging', projectRef: 'stg', inspectedAt: '2026-10-10T00:00:00.000Z', objects: [], buckets: [] },
    });
    const child = model.objects.find((item) => item.name === 'child');
    expect(child?.relationsOut[0]?.evidence).toBe('migration');
    expect(model.status).toBe('partial');
  });

  it('marca una clave foránea de catálogo como verificada y separa los entornos', () => {
    const model = buildAtlasModel({
      declared: [],
      production: {
        environment: 'production',
        projectRef: 'prod',
        inspectedAt: '2026-10-10T00:00:00.000Z',
        objects: [{ name: 'offers', kind: 'r', rls: true }, { name: 'operational_controls', kind: 'r', rls: true }],
        foreignKeys: [{ table_name: 'offers', column_name: 'created_by', ref_schema: 'public', ref_table: 'profiles', ref_column: 'id' }],
        buckets: [{ name: 'offer-images', public: true }],
      },
      staging: {
        environment: 'staging',
        projectRef: 'stg',
        inspectedAt: '2026-10-10T00:00:00.000Z',
        objects: [{ name: 'ofertas', kind: 'r', rls: true }],
        buckets: [],
      },
    });
    expect(model.objects.find((item) => item.name === 'offers')?.relationsOut[0]?.evidence).toBe('foreign_key');
    expect(model.counts.productionOnly).toBeGreaterThan(0);
    expect(model.counts.stagingOnly).toBe(1);
    expect(model.objects.find((item) => item.name === 'offers')?.purpose).toBe('La finalidad necesita documentación.');
  });
});

describe('acceso del atlas', () => {
  it('exige owner antes de cargar el inventario y no consulta filas', () => {
    const page = readFileSync('app/admin/sistemas/atlas/page.tsx', 'utf8');
    expect(page.indexOf('requireOwnerSession(')).toBeLessThan(page.indexOf('loadDatabaseAtlas()'));
    expect(page).not.toMatch(/from\(['"]offers['"]\)|select\s+\*\s+from/i);
    const client = readFileSync('app/admin/sistemas/atlas/AtlasClient.tsx', 'utf8');
    expect(client).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('el inventario cargado distingue producción, staging y migraciones', () => {
    const atlas = loadDatabaseAtlas();
    const controls = atlas.objects.find((item) => item.name === 'operational_controls');
    expect(controls?.inProduction).toBe(true);
    expect(controls?.inStaging).toBe(false);
    expect(controls?.inMigrations).toBe(true);
    expect(controls?.rls).toBe(true);
    expect(atlas.objects.find((item) => item.name === 'ofertas')?.inStaging).toBe(true);
    expect(atlas.objects.find((item) => item.name === 'ofertas')?.inProduction).toBe(false);
    expect(atlas.provenance).toMatch(/No incluye filas/);
  });
});
