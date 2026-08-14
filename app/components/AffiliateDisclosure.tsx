import {
  AFFILIATE_DISCLOSURE_ES,
  AMAZON_ASSOCIATES_DISCLOSURE,
} from '@/lib/commissions/programStatus';

type AffiliateDisclosureProps = {
  /** compact = una línea bajo el CTA; footer = bloque del layout */
  variant?: 'compact' | 'block';
  className?: string;
  /** Incluye la frase EN de Amazon Associates */
  includeAmazonEn?: boolean;
};

/** Aviso de afiliados reutilizable (oferta, modal, footer). */
export default function AffiliateDisclosure({
  variant = 'compact',
  className = '',
  includeAmazonEn = false,
}: AffiliateDisclosureProps) {
  if (variant === 'block') {
    return (
      <div className={`space-y-1 text-xs text-gray-500 dark:text-gray-400 ${className}`}>
        <p>{AFFILIATE_DISCLOSURE_ES}</p>
        {includeAmazonEn ? <p>{AMAZON_ASSOCIATES_DISCLOSURE}</p> : null}
      </div>
    );
  }

  return (
    <p
      className={`text-[11px] leading-snug text-gray-500 dark:text-gray-400 ${className}`}
      data-affiliate-disclosure="true"
    >
      {AFFILIATE_DISCLOSURE_ES}
      {includeAmazonEn ? (
        <>
          {' '}
          <span className="text-gray-400 dark:text-gray-500">{AMAZON_ASSOCIATES_DISCLOSURE}</span>
        </>
      ) : null}
    </p>
  );
}
