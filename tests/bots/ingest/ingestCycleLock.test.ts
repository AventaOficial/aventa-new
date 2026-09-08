import { describe, expect, it } from 'vitest';
import {
  acquireIngestCycleLock,
  releaseIngestCycleLock,
  INGEST_LOCK_TABLE,
  INGEST_LOCK_TTL_MS,
} from '@/lib/bots/ingest/ingestCycleLock';

type Row = { lock_key: string; holder: string; acquired_at: string; expires_at: string };

/**
 * Postgres falso con la semántica que importa: PRIMARY KEY sobre lock_key y
 * update condicional que solo afecta filas que cumplen el WHERE. Sin eso el
 * test no probaría nada del lock.
 */
function fakeDb(initial: Row[] = []) {
  const rows = new Map<string, Row>(initial.map((r) => [r.lock_key, r]));
  const client = {
    rows,
    from(table: string) {
      if (table !== INGEST_LOCK_TABLE) throw new Error(`tabla inesperada: ${table}`);
      return {
        insert(values: Row[]) {
          const value = values[0]!;
          if (rows.has(value.lock_key)) {
            return Promise.resolve({
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            });
          }
          rows.set(value.lock_key, value);
          return Promise.resolve({ error: null });
        },
        update(patch: Partial<Row>) {
          const filters: Array<(row: Row) => boolean> = [];
          const builder = {
            eq(column: keyof Row, value: string) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            lte(column: keyof Row, value: string) {
              filters.push((row) => row[column] <= value);
              return builder;
            },
            select() {
              return Promise.resolve(builder.apply());
            },
            apply() {
              const matched = [...rows.values()].filter((row) => filters.every((f) => f(row)));
              for (const row of matched) rows.set(row.lock_key, { ...row, ...patch });
              return { data: matched.map((r) => ({ lock_key: r.lock_key })), error: null };
            },
            then(resolve: (v: unknown) => unknown) {
              return Promise.resolve(builder.apply()).then(resolve);
            },
          };
          return builder;
        },
      };
    },
  };
  return client as unknown as Parameters<typeof acquireIngestCycleLock>[0]['supabase'] & {
    rows: Map<string, Row>;
  };
}

const NOW = new Date('2026-09-08T20:00:00.000Z');
const KEY = 'ingest:ml_worker';

describe('FASE 5 lock distribuido de ciclo', () => {
  it('A. un ciclo libre adquiere el lock', async () => {
    const out = await acquireIngestCycleLock({ lockKey: KEY, supabase: fakeDb(), now: NOW });
    expect(out.acquired).toBe(true);
    expect(out).toMatchObject({ reason: 'free' });
  });

  it('B. dos runners simultáneos: solo uno gana', async () => {
    const db = fakeDb();
    const first = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });
    const second = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });

    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(false);
    expect(second).toMatchObject({ reason: 'held' });
  });

  it('C. el perdedor no puede colarse repitiendo el intento', async () => {
    const db = fakeDb();
    await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });
    for (let i = 0; i < 5; i++) {
      const retry = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });
      expect(retry.acquired).toBe(false);
    }
  });

  it('D. un lock vencido se puede tomar: una caída no detiene la ingesta para siempre', async () => {
    const db = fakeDb();
    await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });

    const despues = new Date(NOW.getTime() + INGEST_LOCK_TTL_MS + 1000);
    const out = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: despues });
    expect(out.acquired).toBe(true);
    expect(out).toMatchObject({ reason: 'stole_expired' });
  });

  it('E. justo antes de vencer sigue bloqueado', async () => {
    const db = fakeDb();
    await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });
    const casi = new Date(NOW.getTime() + INGEST_LOCK_TTL_MS - 1000);
    expect((await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: casi })).acquired).toBe(
      false
    );
  });

  it('F. liberar permite que el siguiente ciclo entre enseguida', async () => {
    const db = fakeDb();
    const first = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });
    if (!first.acquired) throw new Error('debería haber adquirido');

    await releaseIngestCycleLock({ lockKey: KEY, holder: first.holder, supabase: db, now: NOW });

    const second = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });
    expect(second.acquired).toBe(true);
  });

  it('G. un ciclo lento no puede liberar el lock de quien se lo robó', async () => {
    const db = fakeDb();
    const lento = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: NOW });
    if (!lento.acquired) throw new Error('debería haber adquirido');

    const despues = new Date(NOW.getTime() + INGEST_LOCK_TTL_MS + 1000);
    const nuevo = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: despues });
    if (!nuevo.acquired) throw new Error('debería haber robado');

    // El lento termina tarde e intenta soltar: no debe tocar el lock ajeno.
    await releaseIngestCycleLock({
      lockKey: KEY,
      holder: lento.holder,
      supabase: db,
      now: despues,
    });

    const tercero = await acquireIngestCycleLock({ lockKey: KEY, supabase: db, now: despues });
    expect(tercero.acquired).toBe(false);
  });

  it('H. claves distintas no se bloquean entre sí', async () => {
    const db = fakeDb();
    expect((await acquireIngestCycleLock({ lockKey: 'a', supabase: db, now: NOW })).acquired).toBe(
      true
    );
    expect((await acquireIngestCycleLock({ lockKey: 'b', supabase: db, now: NOW })).acquired).toBe(
      true
    );
  });

  it('I. sin backend el ciclo continúa: el lock falla ABIERTO', async () => {
    // Bloquear la ingesta porque falló una tabla auxiliar cambiaría desperdicio
    // de cómputo por una parada de supply. La integridad la da el UNIQUE.
    const out = await acquireIngestCycleLock({ lockKey: KEY, supabase: null, now: NOW });
    expect(out.acquired).toBe(true);
    expect(out).toMatchObject({ reason: 'no_backend' });
  });

  it('J. si la tabla no existe el ciclo continúa', async () => {
    const roto = {
      from: () => ({
        insert: () => Promise.resolve({ error: { code: '42P01', message: 'does not exist' } }),
      }),
    } as never;
    const out = await acquireIngestCycleLock({ lockKey: KEY, supabase: roto, now: NOW });
    expect(out.acquired).toBe(true);
    expect(out).toMatchObject({ reason: 'no_backend' });
  });

  it('K. si la DB lanza, el ciclo continúa en vez de caerse', async () => {
    const explota = {
      from: () => {
        throw new Error('conexión caída');
      },
    } as never;
    const out = await acquireIngestCycleLock({ lockKey: KEY, supabase: explota, now: NOW });
    expect(out.acquired).toBe(true);
  });

  it('L. liberar nunca lanza aunque la DB falle', async () => {
    const explota = {
      from: () => {
        throw new Error('conexión caída');
      },
    } as never;
    await expect(
      releaseIngestCycleLock({ lockKey: KEY, holder: 'x', supabase: explota })
    ).resolves.toBeUndefined();
  });

  it('M. cada titular recibe una identidad distinta', async () => {
    const a = await acquireIngestCycleLock({ lockKey: 'a', supabase: fakeDb(), now: NOW });
    const b = await acquireIngestCycleLock({ lockKey: 'b', supabase: fakeDb(), now: NOW });
    if (!a.acquired || !b.acquired) throw new Error('deberían haber adquirido');
    expect(a.holder).not.toBe(b.holder);
  });

  it('N. el TTL está acotado al maxDuration de las rutas de cron', async () => {
    expect(INGEST_LOCK_TTL_MS).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(INGEST_LOCK_TTL_MS).toBeGreaterThan(60 * 1000);
  });
});
