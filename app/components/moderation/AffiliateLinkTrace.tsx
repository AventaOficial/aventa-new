'use client';

import type { MeliLaPasteVerification } from '@/lib/affiliate/verifyMeliLaPaste';
import {
  summarizeAffiliateVerification,
  type AffiliateCheckTone,
} from '@/lib/moderation/affiliateVerificationUi';

const TONE_TEXT: Record<AffiliateCheckTone, string> = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-300',
  bad: 'text-red-600 dark:text-red-300',
};

function UrlRow({ label, url }: { label: string; url: string | null | undefined }) {
  const value = url?.trim();
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{label}</dt>
      <dd className="truncate font-mono text-[11px]">
        {value ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className="underline" title={value}>
            {value}
          </a>
        ) : (
          <span className="opacity-60">—</span>
        )}
      </dd>
    </div>
  );
}

type Props = {
  originalUrl: string | null | undefined;
  publishedUrl: string | null | undefined;
  verification: MeliLaPasteVerification | null;
};

/** Origen → enlace a publicar → destino real, con cuenta y producto comprobados. */
export default function AffiliateLinkTrace({ originalUrl, publishedUrl, verification }: Props) {
  const summary = verification ? summarizeAffiliateVerification(verification) : null;
  return (
    <div className="space-y-2 rounded-xl border border-black/10 px-3 py-2 text-xs dark:border-white/15" data-affiliate-link-trace>
      {summary ? (
        <p className={`font-semibold ${TONE_TEXT[summary.tone]}`} role={summary.tone === 'ok' ? undefined : 'alert'}>
          {summary.headline}
        </p>
      ) : null}
      <dl className="space-y-1.5">
        <UrlRow label="Original del usuario" url={originalUrl} />
        <UrlRow label="Enlace a publicar" url={publishedUrl} />
        {verification ? <UrlRow label="Destino (redirección)" url={verification.destinationUrl} /> : null}
      </dl>
      {summary ? (
        <ul className="space-y-0.5">
          {summary.lines.map((line) => (
            <li key={line.label} className={TONE_TEXT[line.tone]}>
              <span className="opacity-70">{line.label}:</span> {line.value}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
