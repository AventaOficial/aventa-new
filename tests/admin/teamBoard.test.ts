import { describe, it, expect } from 'vitest';
import {
  parseStaffWorkBoard,
  isFilmWorthyOffer,
  queueTone,
  seedDefaultTasks,
} from '../../lib/staff/workBoard';

describe('teamBoard', () => {
  it('parseTeamWorkBoard ignora filas rotas y recorta texto', () => {
    const board = parseStaffWorkBoard({
      tasks: [
        { id: 'a', text: 'Revisar cola', done: true, createdAt: '2026-08-18T00:00:00.000Z' },
        { id: 'a', text: 'duplicada' },
        { text: 'sin id' },
        null,
        { id: 'b', text: '  ok  ', done: 'yes' },
      ],
      updatedAt: 'x',
      updatedBy: 3,
    });
    expect(board.tasks).toHaveLength(2);
    expect(board.tasks[0].done).toBe(true);
    expect(board.tasks[1].text).toBe('ok');
    expect(board.tasks[1].done).toBe(false);
    expect(board.updatedBy).toBeNull();
  });

  it('isFilmWorthyOffer exige descuento real en ML o Amazon', () => {
    expect(
      isFilmWorthyOffer({
        price: 800,
        originalPrice: 1200,
        title: 'Audífonos Bluetooth Sony WH',
        offerUrl: 'https://www.mercadolibre.com.mx/audifonos/MLM123',
      }),
    ).toBe(true);
    expect(
      isFilmWorthyOffer({
        price: 800,
        originalPrice: 810,
        title: 'Audífonos Bluetooth Sony WH',
        offerUrl: 'https://www.mercadolibre.com.mx/audifonos/MLM123',
      }),
    ).toBe(false);
    expect(
      isFilmWorthyOffer({
        price: 800,
        originalPrice: 1200,
        title: 'Audífonos Bluetooth Sony WH',
        offerUrl: 'https://www.temu.com/x',
      }),
    ).toBe(false);
  });

  it('queueTone marca inventario bajo y cola del bot inflada', () => {
    expect(queueTone(0, 'pending-bot')).toBe('ok');
    expect(queueTone(13, 'pending-bot')).toBe('blocked');
    expect(queueTone(3, 'live-today')).toBe('blocked');
    expect(queueTone(15, 'live-today')).toBe('ok');
    expect(seedDefaultTasks('moderacion').length).toBeGreaterThan(3);
  });
});
