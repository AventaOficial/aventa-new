/**
 * CazaOfertasss — FASE 4. Concurrencia acotada.
 *
 * Reemplazo de `Promise.all` sin límite: como máximo `concurrency` tareas en
 * vuelo. El orden de salida es el de entrada (determinista).
 */

export async function mapBounded<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const width = Math.max(1, Math.min(Math.floor(concurrency), items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
