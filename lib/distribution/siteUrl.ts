/**
 * Public origin for CTA hop links in Distribution messages.
 */
export function getPublicAppOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const explicit =
    (env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const vercel = (env.VERCEL_URL ?? '').trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'https://aventaofertas.com';
}

export function buildDistributionHopUrl(
  publicationId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return `${getPublicAppOrigin(env)}/r/d/${publicationId}`;
}
