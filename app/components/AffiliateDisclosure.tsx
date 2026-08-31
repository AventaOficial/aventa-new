import {
  AFFILIATE_DISCLOSURE_ES,
  AMAZON_ASSOCIATES_DISCLOSURE,
} from '@/lib/commissions/programStatus';

type AffiliateDisclosureProps = {
  /**
   * badge = una línea mínima pegada al CTA;
   * compact = párrafo de una línea;
   * feed = disclosure mínimo en tarjetas del feed;
   * block = bloque del footer.
   */
  variant?: 'badge' | 'compact' | 'feed' | 'block';
  className?: string;
  /** Incluye la frase EN de Amazon Associates */
  includeAmazonEn?: boolean;
};

/**
 * Aviso de afiliados reutilizable (oferta, modal, footer).
 *
 * El texto completo vive en «Información adicional», pero junto al enlace queda
 * siempre la variante `badge`: Amazon Associates y la FTC exigen que la
 * divulgación sea visible sin abrir nada, y esconderla entera pone en riesgo la
 * cuenta de afiliado.
 */
export default function AffiliateDisclosure({
  variant = 'compact',
  className = '',
  includeAmazonEn = false,
}: AffiliateDisclosureProps) {
  if (variant === 'feed') {
    return (
      <p
        className={`text-[10px] leading-snug text-gray-400 dark:text-gray-500 ${className}`}
        data-affiliate-disclosure="true"
      >
        AVENTA puede recibir una comisión si compras mediante este enlace.
        {includeAmazonEn ? (
          <>
            {' '}
            <span className="italic">{AMAZON_ASSOCIATES_DISCLOSURE}</span>
          </>
        ) : null}
      </p>
    );
  }

  if (variant === 'badge') {
    return (
      <p
        className={`text-[11px] leading-snug text-gray-400 dark:text-gray-500 ${className}`}
        data-affiliate-disclosure="true"
      >
        Enlace de afiliado · así se sostiene Aventa
      </p>
    );
  }

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
