/** Ejecuta tareas async con a lo sumo `concurrency` en vuelo (evita timeouts en crons con muchos envíos). */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }

  const n = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
