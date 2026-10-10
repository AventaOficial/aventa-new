import declaredDocument from '@/lib/databaseAtlas/declared.generated.json';
import productionFks from '@/lib/databaseAtlas/production.fks.json';
import productionSnapshot from '@/lib/databaseAtlas/production.snapshot.json';
import stagingSnapshot from '@/lib/databaseAtlas/staging.snapshot.json';
import type { DeclaredObject } from '@/lib/databaseAtlas/parseMigrations';

export type AtlasKind = 'table' | 'view' | 'materialized_view' | 'function' | 'trigger';

export type AtlasRelation = {
  from: string;
  column: string;
  toSchema: string;
  to: string;
  toColumn: string;
  evidence: 'foreign_key' | 'migration';
};

export type AtlasObject = {
  schema: string;
  name: string;
  kind: AtlasKind;
  domain: string;
  purpose: string;
  columns: { name: string; dataType: string; nullable: boolean }[];
  primaryKey: string[];
  indexes: string[];
  rls: boolean | null;
  policies: { name: string; command: string }[];
  migrationFile: string | null;
  inProduction: boolean;
  inStaging: boolean;
  inMigrations: boolean;
  relationsOut: AtlasRelation[];
  relationsIn: AtlasRelation[];
};

export type AtlasModel = {
  inspectedAt: string;
  status: 'partial';
  provenance: string;
  objects: AtlasObject[];
  buckets: { environment: 'production' | 'staging'; name: string; public: boolean }[];
  counts: {
    tables: number;
    views: number;
    materializedViews: number;
    functions: number;
    triggers: number;
    verifiedRelations: number;
    rlsTables: number;
    purposePending: number;
    productionOnly: number;
    stagingOnly: number;
  };
};

type Snapshot = {
  environment: 'production' | 'staging';
  projectRef: string;
  inspectedAt: string;
  objects: { name: string; kind: string; rls: boolean }[];
  foreignKeys?: { table_name: string; column_name: string; ref_schema: string; ref_table: string; ref_column: string }[];
  buckets: { name: string; public: boolean }[];
};

const KIND: Record<string, AtlasKind> = { r: 'table', v: 'view', m: 'materialized_view' };

export function inferredDomain(name: string): string {
  const value = name.toLowerCase();
  if (value.startsWith('operational_control')) return 'operacion';
  if (/offer|oferta/.test(value)) return 'ofertas';
  if (/vote|voto/.test(value)) return 'votos';
  if (/comment|like|favorite|report/.test(value)) return 'comunidad';
  if (/profile|user_|auth/.test(value)) return 'personas';
  if (/reward|commission|payout|ledger|affiliate/.test(value)) return 'economia';
  if (/moderat|ban/.test(value)) return 'moderacion';
  if (/team_/.test(value)) return 'equipos';
  return 'sin dominio';
}

function relationKey(item: AtlasRelation): string {
  return `${item.from}.${item.column}->${item.toSchema}.${item.to}.${item.toColumn}`;
}

export function buildAtlasModel(input: {
  declared: DeclaredObject[];
  production: Snapshot;
  staging: Snapshot;
}): AtlasModel {
  const map = new Map<string, AtlasObject>();
  const touch = (schema: string, name: string, kind: AtlasKind): AtlasObject => {
    const id = `${schema}.${name}`;
    const existing = map.get(id);
    if (existing) return existing;
    const created: AtlasObject = {
      schema,
      name,
      kind,
      domain: inferredDomain(name),
      purpose: 'La finalidad necesita documentación.',
      columns: [],
      primaryKey: [],
      indexes: [],
      rls: null,
      policies: [],
      migrationFile: null,
      inProduction: false,
      inStaging: false,
      inMigrations: false,
      relationsOut: [],
      relationsIn: [],
    };
    map.set(id, created);
    return created;
  };

  for (const item of input.declared) {
    const object = touch(item.schema, item.name, item.kind);
    object.inMigrations = true;
    object.migrationFile = item.migrationFile;
    if (item.columns.length > 0) object.columns = item.columns;
    if (item.primaryKey.length > 0) object.primaryKey = item.primaryKey;
    if (item.indexes.length > 0) object.indexes = item.indexes;
    if (item.rlsEnabled != null) object.rls = item.rlsEnabled;
    if (item.policies.length > 0) object.policies = item.policies;
    if (item.purpose) object.purpose = item.purpose;
    for (const key of item.foreignKeys) {
      object.relationsOut.push({
        from: item.name,
        column: key.columns.join(', '),
        toSchema: key.refSchema,
        to: key.refTable,
        toColumn: key.refColumns.join(', '),
        evidence: 'migration',
      });
    }
  }

  for (const item of input.production.objects) {
    const kind = KIND[item.kind] ?? 'table';
    const object = touch('public', item.name, kind);
    object.inProduction = true;
    object.rls = item.rls;
    object.kind = kind;
  }
  for (const item of input.staging.objects) {
    const kind = KIND[item.kind] ?? 'table';
    const object = touch('public', item.name, kind);
    object.inStaging = true;
    if (!object.inProduction) object.rls = item.rls;
    if (!object.inMigrations) object.kind = kind;
  }

  const seen = new Set<string>();
  for (const key of input.production.foreignKeys ?? []) {
    const relation: AtlasRelation = {
      from: key.table_name,
      column: key.column_name,
      toSchema: key.ref_schema,
      to: key.ref_table,
      toColumn: key.ref_column,
      evidence: 'foreign_key',
    };
    const id = relationKey(relation);
    if (seen.has(id)) continue;
    seen.add(id);
    const source = map.get(`public.${key.table_name}`);
    if (source) source.relationsOut = [relation, ...source.relationsOut.filter((item) => relationKey(item) !== id || item.evidence === 'foreign_key')];
    const targetName = key.ref_schema === 'public' ? key.ref_table : null;
    const target = targetName ? map.get(`public.${targetName}`) : null;
    if (target) target.relationsIn.push(relation);
    else if (key.ref_schema === 'auth' && key.ref_table === 'users') {
      const auth = touch('auth', 'users', 'table');
      auth.purpose = 'Identidad de Supabase Auth. Este inventario no lista personas, correos ni sesiones.';
      auth.relationsIn.push(relation);
    }
  }

  for (const object of map.values()) {
    const verified = new Set(object.relationsOut.filter((item) => item.evidence === 'foreign_key').map(relationKey));
    object.relationsOut = object.relationsOut.filter((item) => item.evidence === 'foreign_key' || !verified.has(relationKey(item)));
  }

  const objects = [...map.values()].sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name));
  const tables = objects.filter((item) => item.kind === 'table');
  return {
    inspectedAt: input.production.inspectedAt,
    status: 'partial',
    provenance: 'Catálogo public observado en producción y staging el 2026-10-10, cruzado con las migraciones versionadas. No incluye filas ni cuerpos de funciones.',
    objects,
    buckets: [
      ...input.production.buckets.map((item) => ({ environment: 'production' as const, ...item })),
      ...input.staging.buckets.map((item) => ({ environment: 'staging' as const, ...item })),
    ],
    counts: {
      tables: tables.length,
      views: objects.filter((item) => item.kind === 'view').length,
      materializedViews: objects.filter((item) => item.kind === 'materialized_view').length,
      functions: objects.filter((item) => item.kind === 'function').length,
      triggers: objects.filter((item) => item.kind === 'trigger').length,
      verifiedRelations: objects.reduce((sum, item) => sum + item.relationsOut.filter((relation) => relation.evidence === 'foreign_key').length, 0),
      rlsTables: tables.filter((item) => item.rls === true && item.inProduction).length,
      purposePending: objects.filter((item) => item.purpose.startsWith('La finalidad necesita')).length,
      productionOnly: objects.filter((item) => item.inProduction && !item.inStaging).length,
      stagingOnly: objects.filter((item) => item.inStaging && !item.inProduction).length,
    },
  };
}

export function loadDatabaseAtlas(): AtlasModel {
  return buildAtlasModel({
    declared: declaredDocument.objects as DeclaredObject[],
    production: { ...(productionSnapshot as Snapshot), foreignKeys: productionFks },
    staging: stagingSnapshot as Snapshot,
  });
}
