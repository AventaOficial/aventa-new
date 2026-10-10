'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AtlasModel, AtlasObject } from '@/lib/databaseAtlas/build';

const KIND_OPTIONS = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'table', label: 'Tablas' },
  { value: 'view', label: 'Vistas' },
  { value: 'materialized_view', label: 'Vistas materializadas' },
  { value: 'function', label: 'Funciones' },
  { value: 'trigger', label: 'Triggers' },
] as const;

const VERIFICATION_OPTIONS = [
  { value: 'all', label: 'Cualquier verificación' },
  { value: 'production', label: 'Observado en producción' },
  { value: 'staging', label: 'Observado en staging' },
  { value: 'migrations', label: 'Declarado en migraciones' },
  { value: 'production-only', label: 'Solo producción' },
  { value: 'staging-only', label: 'Solo staging' },
  { value: 'pending', label: 'Finalidad pendiente' },
] as const;

function kindLabel(kind: AtlasObject['kind']): string {
  if (kind === 'materialized_view') return 'Vista materializada';
  if (kind === 'view') return 'Vista';
  if (kind === 'function') return 'Función';
  if (kind === 'trigger') return 'Trigger';
  return 'Tabla';
}

export default function AtlasClient({ atlas }: { atlas: AtlasModel }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [schema, setSchema] = useState('all');
  const [domain, setDomain] = useState('all');
  const [verification, setVerification] = useState('all');
  const [selected, setSelected] = useState('public.offers');

  const schemas = useMemo(() => ['all', ...new Set(atlas.objects.map((item) => item.schema))], [atlas.objects]);
  const domains = useMemo(() => ['all', ...new Set(atlas.objects.map((item) => item.domain))].sort(), [atlas.objects]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return atlas.objects.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false;
      if (schema !== 'all' && item.schema !== schema) return false;
      if (domain !== 'all' && item.domain !== domain) return false;
      if (verification === 'production' && !item.inProduction) return false;
      if (verification === 'staging' && !item.inStaging) return false;
      if (verification === 'migrations' && !item.inMigrations) return false;
      if (verification === 'production-only' && !(item.inProduction && !item.inStaging)) return false;
      if (verification === 'staging-only' && !(item.inStaging && !item.inProduction)) return false;
      if (verification === 'pending' && !item.purpose.startsWith('La finalidad necesita')) return false;
      if (q && !`${item.schema}.${item.name}`.includes(q)) return false;
      return true;
    });
  }, [atlas.objects, query, kind, schema, domain, verification]);
  const current = atlas.objects.find((item) => `${item.schema}.${item.name}` === selected) ?? filtered[0] ?? null;

  return (
    <section className="space-y-4" aria-label="Mapa de la base de datos">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">Sistema</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Database Atlas</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/50">
          Mapa de tablas, vistas y relaciones. Inventario parcial: no es una auditoría completa de producción y no muestra filas.
        </p>
        <p className="mt-2 text-xs text-white/40">Inspección: {atlas.inspectedAt}. {atlas.provenance}</p>
        <Link href="/admin/sistemas/mapa" className="mt-2 inline-block text-sm text-violet-300 hover:underline">Volver al Systems Map</Link>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Tablas" value={atlas.counts.tables} />
        <Metric label="Vistas" value={atlas.counts.views} />
        <Metric label="Vistas materializadas" value={atlas.counts.materializedViews} />
        <Metric label="Relaciones por clave foránea" value={atlas.counts.verifiedRelations} />
        <Metric label="Funciones en migraciones" value={atlas.counts.functions} />
        <Metric label="Triggers en migraciones" value={atlas.counts.triggers} />
        <Metric label="Buckets observados" value={atlas.buckets.length} />
        <Metric label="Tablas con RLS en producción" value={atlas.counts.rlsTables} />
        <Metric label="Finalidad pendiente" value={atlas.counts.purposePending} />
        <Metric label="Solo producción" value={atlas.counts.productionOnly} />
        <Metric label="Solo staging" value={atlas.counts.stagingOnly} />
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre" className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white md:col-span-1" />
        <Select value={kind} onChange={setKind} options={KIND_OPTIONS} />
        <Select value={schema} onChange={setSchema} options={schemas.map((option) => ({ value: option, label: option === 'all' ? 'Todos los esquemas' : option }))} />
        <Select value={domain} onChange={setDomain} options={domains.map((option) => ({ value: option, label: option === 'all' ? 'Todos los dominios' : option }))} />
        <Select value={verification} onChange={setVerification} options={VERIFICATION_OPTIONS} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <ul className="max-h-[32rem] space-y-1 overflow-auto rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          {filtered.length > 200 ? <li className="px-3 py-1 text-[11px] text-white/40">Mostrando 200 de {filtered.length}. Ajusta los filtros para ver el resto.</li> : null}
          {filtered.slice(0, 200).map((item) => {
            const id = `${item.schema}.${item.name}`;
            return (
              <li key={id}>
                <button type="button" onClick={() => setSelected(id)} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selected === id ? 'bg-violet-500/10 text-white' : 'text-white/70'}`}>
                  <span className="block font-medium">{item.name}</span>
                  <span className="text-[11px] text-white/40">{kindLabel(item.kind)} · {item.schema}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {current ? <Detail item={current} objects={atlas.objects} onOpen={setSelected} /> : <p className="text-sm text-white/50">Sin objetos para este filtro.</p>}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
        <h2 className="text-base font-semibold text-white">Storage y Auth</h2>
        <ul className="mt-2 space-y-1">
          {atlas.buckets.map((bucket) => (
            <li key={`${bucket.environment}.${bucket.name}`}>{bucket.environment}: {bucket.name} · {bucket.public ? 'público' : 'privado'}</li>
          ))}
        </ul>
        <p className="mt-3 text-white/50">Auth guarda la identidad. La relación verificada de profiles hacia auth.users es una clave foránea. No se listan correos, sesiones ni archivos.</p>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function Detail({ item, objects, onOpen }: { item: AtlasObject; objects: AtlasObject[]; onOpen: (id: string) => void }) {
  const triggers = objects.filter((candidate) => candidate.kind === 'trigger' && candidate.purpose === `Asociado a ${item.name}`);
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
      <p className="text-base font-semibold text-white">{item.schema}.{item.name}</p>
      <p className="mt-2">{item.purpose}</p>
      <p className="mt-2 text-white/50">
        {kindLabel(item.kind)}. Dominio inferido por el nombre: {item.domain}. RLS: {item.rls == null ? 'sin dato' : item.rls ? 'habilitado' : 'no habilitado'}.
      </p>
      <p className="mt-1 text-white/50">
        Producción: {item.inProduction ? 'observada' : 'no observada'}. Staging: {item.inStaging ? 'observada' : 'no observada'}. Migraciones: {item.inMigrations ? item.migrationFile : 'no declarada'}.
      </p>
      {item.columns.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {item.columns.map((column) => (
            <li key={column.name}>{column.name} · {column.dataType}{column.nullable ? '' : ' · obligatoria'}{item.primaryKey.includes(column.name) ? ' · clave' : ''}</li>
          ))}
        </ul>
      ) : <p className="mt-3 text-white/45">Columnas no extraídas de una migración legible para este objeto.</p>}
      <h3 className="mt-4 font-semibold text-white">Sale hacia</h3>
      <RelationList items={item.relationsOut} onOpen={onOpen} direction="out" />
      <h3 className="mt-3 font-semibold text-white">Llega desde</h3>
      <RelationList items={item.relationsIn} onOpen={onOpen} direction="in" />
      {item.policies.length > 0 ? <p className="mt-3">Políticas declaradas: {item.policies.map((policy) => `${policy.name} (${policy.command})`).join(', ')}.</p> : <p className="mt-3 text-white/45">No hay políticas declaradas en el inventario cargado. RLS habilitado no lista aquí el texto de cada política.</p>}
      {item.indexes.length > 0 ? <p className="mt-2">Índices declarados: {item.indexes.join(', ')}.</p> : null}
      <h3 className="mt-4 font-semibold text-white">Triggers asociados</h3>
      {triggers.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {triggers.map((trigger) => (
            <li key={`${trigger.schema}.${trigger.name}`}>
              <button type="button" onClick={() => onOpen(`${trigger.schema}.${trigger.name}`)} className="text-violet-300 hover:underline">{trigger.name}</button>
              <span className="text-white/40"> · {trigger.migrationFile ?? 'sin archivo'}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-white/45">Ningún trigger de las migraciones nombra esta tabla.</p>}
      <p className="mt-2 text-white/45">Las funciones aparecen en el inventario, sin el cuerpo y sin una tabla asociada, porque el SQL no siempre declara esa relación.</p>
    </article>
  );
}

function RelationList({ items, onOpen, direction }: { items: AtlasObject['relationsOut']; onOpen: (id: string) => void; direction: 'out' | 'in' }) {
  if (items.length === 0) return <p className="text-white/45">Ninguna relación verificada en este sentido.</p>;
  return (
    <ul className="mt-1 space-y-1">
      {items.map((item) => {
        const target = direction === 'out' ? `${item.toSchema}.${item.to}` : `public.${item.from}`;
        return (
          <li key={`${item.from}.${item.column}.${item.to}.${item.toColumn}.${item.evidence}`}>
            <button type="button" onClick={() => onOpen(target)} className="text-left text-violet-300 hover:underline">
              {item.from}.{item.column} → {item.toSchema}.{item.to}.{item.toColumn}
            </button>
            <span className="text-white/40"> · {item.evidence === 'foreign_key' ? 'clave foránea observada' : 'declarada en migración'}</span>
          </li>
        );
      })}
    </ul>
  );
}
