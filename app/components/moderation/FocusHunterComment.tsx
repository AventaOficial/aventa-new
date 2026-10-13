'use client';

import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { HUNTER_COMMENT_DROP_LABELS, parseHunterCommentReview } from '@/lib/offers/hunterCommentReview';
import { cn } from '@/app/components/panel/utils';

type Props = {
  mode: ModerationHubMode;
  hunterComment?: string | null;
  botMeta?: unknown;
};

/** Comentario público de la tarjeta y, si el filtro editorial lo descartó, el borrador del bot. */
export default function FocusHunterComment({ mode, hunterComment, botMeta }: Props) {
  const ui = moderationUi(mode);
  const comment = hunterComment?.trim() || null;
  const review = parseHunterCommentReview(botMeta);
  const dropped = review?.status === 'dropped' ? review : null;
  if (!comment && !dropped) return null;

  return (
    <section data-focus-hunter-comment>
      <p className={cn('text-[10px] font-semibold uppercase tracking-wider', ui.label)}>
        Comentario del cazador
      </p>
      {comment ? (
        <>
          <p className={cn('mt-1 text-sm leading-snug break-words', ui.body)}>{comment}</p>
          <p className={cn('mt-0.5 text-[11px]', ui.faint)}>Se muestra en la tarjeta pública. Edítalo si no es exacto.</p>
        </>
      ) : null}
      {dropped ? (
        <div className={cn('mt-1 text-xs leading-snug', ui.muted)} data-focus-hunter-comment-dropped>
          <p>
            Borrador del bot descartado
            {dropped.reason ? ` (${HUNTER_COMMENT_DROP_LABELS[dropped.reason]})` : ''}; no se publica.
          </p>
          {dropped.submitted ? <p className={cn('mt-0.5 break-words italic', ui.faint)}>«{dropped.submitted}»</p> : null}
        </div>
      ) : null}
    </section>
  );
}
