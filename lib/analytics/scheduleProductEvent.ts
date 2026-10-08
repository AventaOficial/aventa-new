import { after } from 'next/server';
import { incrementLaunchMetric } from '@/lib/observability/launchMetrics';

/**
 * Corre el insert después de responder. Un fallo de analítica no rechaza el request.
 * Si `after` no está disponible (tests, fuera de request), el trabajo igual queda aislado.
 */
export function scheduleProductEvent(work: () => Promise<unknown>): void {
  const run = () => {
    void Promise.resolve()
      .then(() => work())
      .catch((error: unknown) => {
        console.error('[product-event] observer failed', error instanceof Error ? error.name : 'error');
        incrementLaunchMetric('analytics_write_failed');
      });
  };

  try {
    after(run);
  } catch {
    run();
  }
}
