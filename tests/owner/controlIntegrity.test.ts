import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTable, listOperationalControls, writeOperationalControl } from '@/lib/control/store';

const input = {
  domain: 'feed_presentation' as const,
  recordKey: 'home_vitales',
  payload: { maxSameProduct: 2 },
  actorId: '11111111-1111-1111-1111-111111111111',
};

function client(opts: {
  readError?: { code?: string; message?: string } | null;
  readData?: unknown;
  writeError?: { code?: string; message?: string } | null;
  auditError?: { code?: string; message?: string } | null;
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'operational_control_audit') {
        return { insert: async () => ({ error: opts.auditError ?? null }) };
      }
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle: async () => ({ data: opts.readData ?? null, error: opts.readError ?? null }),
        upsert: async () => ({ error: opts.writeError ?? null }),
        then(resolve: (value: { data: unknown; error: { code?: string; message?: string } | null }) => void) {
          resolve({ data: opts.readData ?? [], error: opts.readError ?? null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe('ausencia de tabla y auditoría', () => {
  it('clasifica solo los códigos de relación inexistente', () => {
    expect(isMissingTable({ code: '42P01', message: 'relation operational_controls does not exist' })).toBe(true);
    expect(isMissingTable({ code: 'PGRST205', message: 'Could not find the table operational_controls' })).toBe(true);
    expect(isMissingTable({ code: '42501', message: 'permission denied for table operational_controls' })).toBe(false);
    expect(isMissingTable({ message: 'fetch failed' })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });

  it('una tabla ausente degrada y un permiso o una caída no se ocultan', async () => {
    await expect(listOperationalControls(client({ readError: { code: '42P01' } }))).resolves.toMatchObject({
      storage: 'missing',
      rows: [],
    });
    await expect(listOperationalControls(client({ readError: { code: 'PGRST205' } }))).resolves.toMatchObject({
      storage: 'missing',
    });
    await expect(
      listOperationalControls(client({ readError: { code: '42501', message: 'permission denied for table operational_controls' } })),
    ).rejects.toThrow('No se pudo leer');
    await expect(listOperationalControls(client({ readError: { message: 'fetch failed' } }))).rejects.toThrow(
      'No se pudo leer',
    );
  });

  it('no confirma el guardado si la auditoría falla', async () => {
    const saved = await writeOperationalControl(client({ readData: { payload: { maxSameProduct: 1 } } }), input);
    expect(saved).toEqual({ status: 'saved' });

    const audited = await writeOperationalControl(
      client({
        readData: { payload: { maxSameProduct: 1 } },
        auditError: { code: '42501', message: 'permission denied for table operational_control_audit' },
      }),
      input,
    );
    expect(audited).toEqual({ status: 'audit_failed' });

    const missingAuditTable = await writeOperationalControl(
      client({ readData: null, auditError: { code: '42P01', message: 'relation operational_control_audit does not exist' } }),
      input,
    );
    expect(missingAuditTable).toEqual({ status: 'audit_failed' });
  });

  it('la tabla de configuración ausente no se informa como éxito', async () => {
    await expect(writeOperationalControl(client({ readError: { code: '42P01' } }), input)).resolves.toEqual({
      status: 'missing',
    });
    await expect(
      writeOperationalControl(client({ readError: { code: '42501', message: 'permission denied for table operational_controls' } }), input),
    ).rejects.toThrow('No se pudo leer');
    await expect(writeOperationalControl(client({ writeError: { message: 'fetch failed' } }), input)).rejects.toThrow(
      'No se pudo guardar',
    );
  });
});
