import { describe, expect, it } from 'vitest';
import { deleteInterest, insertInterest, updateInterest } from '@/lib/interests/store';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

type Result = { data: unknown; error: { code?: string; message?: string } | null };

function row(id: string, labelNorm: string, userId = USER) {
  return {
    id,
    user_id: userId,
    label: labelNorm,
    label_norm: labelNorm,
    brand: null,
    brand_norm: null,
    model: null,
    model_norm: null,
    category: null,
    aliases: [],
    alias_norms: [],
    cadence: 'occasional',
    notify: true,
    updated_at: '2026-10-09T00:00:00.000Z',
  };
}

function client(list: Result, write: Result) {
  const seenUserIds: string[] = [];
  const api = {
    select() {
      return api;
    },
    eq(column: string, value: string) {
      if (column === 'user_id') seenUserIds.push(value);
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return Promise.resolve(list);
    },
    insert(payload: { user_id: string }) {
      seenUserIds.push(payload.user_id);
      return api;
    },
    update(payload: { user_id: string }) {
      seenUserIds.push(payload.user_id);
      return api;
    },
    delete() {
      return api;
    },
    single() {
      return Promise.resolve(write);
    },
    maybeSingle() {
      return Promise.resolve(write);
    },
    then(resolve: (value: Result) => unknown) {
      return Promise.resolve(write).then(resolve);
    },
  };
  return {
    seenUserIds,
    from() {
      return api;
    },
  };
}

describe('persistencia de intereses', () => {
  it('rechaza el interés 31 y un duplicado normalizado', async () => {
    const full = client(
      { data: Array.from({ length: 30 }, (_, index) => row(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, `item ${index}`)), error: null },
      { data: null, error: null },
    );
    const limited = await insertInterest(full as never, USER, { label: 'Nuevo café' });
    expect(limited).toEqual({ error: 'Llegaste al límite de 30 intereses.', status: 400 });

    const duplicate = client(
      { data: [row('33333333-3333-4333-8333-333333333333', 'cafe')], error: null },
      { data: null, error: null },
    );
    const again = await insertInterest(duplicate as never, USER, { label: 'Café' });
    expect(again).toEqual({ error: 'Ese interés ya está en tu lista.', status: 409 });
  });

  it('traduce un choque de unicidad y no devuelve el error crudo de la base', async () => {
    const db = client(
      { data: [], error: null },
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint user_product_interests_identity_idx' } },
    );
    const saved = await insertInterest(db as never, USER, { label: 'Audífonos' });
    expect(saved).toEqual({ error: 'Ese interés ya está en tu lista.', status: 409 });
    expect(JSON.stringify(saved)).not.toContain('user_product_interests_identity_idx');
  });

  it('un fallo desconocido de la base se propaga sin convertir el mensaje en una respuesta de éxito', async () => {
    const db = client({ data: [], error: null }, { data: null, error: { code: '42P01', message: 'relation user_product_interests does not exist' } });
    await expect(insertInterest(db as never, USER, { label: 'Laptop' })).rejects.toEqual({
      code: '42P01',
      message: 'relation user_product_interests does not exist',
    });
  });

  it('editar o borrar exige el usuario de la sesión, no el de otro registro', async () => {
    const missing = client({ data: [], error: null }, { data: null, error: null });
    const updated = await updateInterest(missing as never, USER, '33333333-3333-4333-8333-333333333333', { label: 'Café' });
    expect(updated).toEqual({ error: 'No encontramos ese interés.', status: 404 });
    expect(missing.seenUserIds).toContain(USER);
    expect(missing.seenUserIds).not.toContain(OTHER);

    const removed = client({ data: [], error: null }, { data: [], error: null });
    await expect(deleteInterest(removed as never, USER, '33333333-3333-4333-8333-333333333333')).resolves.toBe(false);
    expect(removed.seenUserIds).toContain(USER);
    expect(removed.seenUserIds).not.toContain(OTHER);
  });
});
