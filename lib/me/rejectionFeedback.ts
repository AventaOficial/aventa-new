/**
 * Lo que el autor puede leer de un rechazo.
 * Solo usa el motivo ya guardado y los presets de moderación.
 * No inventa una explicación ni muestra notas internas nuevas.
 */
import { FOCUS_REJECTION_PRESETS, MODERATION_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { AUTO_REJECTED_TIMEOUT_REASON } from '@/lib/offers/findDuplicateOffer';

export type RejectionFeedback = {
  headline: string;
  detail: string;
  retry: string;
};

const RETRY = 'Corrige ese punto y envía una oferta nueva. Enviar la misma oferta otra vez no la aprueba.';

export function explainRejection(reason: string | null | undefined): RejectionFeedback {
  const trimmed = reason?.trim() ?? '';
  if (!trimmed) {
    return {
      headline: 'La oferta se rechazó.',
      detail: 'No hay un motivo registrado.',
      retry: 'Revisa enlace, precio y datos del producto antes de enviar otra. La moderación sigue decidiendo.',
    };
  }
  if (trimmed === AUTO_REJECTED_TIMEOUT_REASON) {
    return {
      headline: 'Se quedó sin revisión a tiempo.',
      detail: 'La oferta expiró en la cola. No es un juicio de spam.',
      retry: 'Puedes enviarla de nuevo si el precio sigue vigente.',
    };
  }
  const preset = [...FOCUS_REJECTION_PRESETS, ...MODERATION_REJECTION_PRESETS].find(
    (item) => item.full === trimmed || item.short === trimmed,
  );
  if (preset) {
    return { headline: preset.short, detail: preset.full, retry: RETRY };
  }
  return {
    headline: 'La oferta se rechazó.',
    detail: trimmed.slice(0, 500),
    retry: RETRY,
  };
}
