import type { ReactNode } from 'react';
import type { SocialConfig } from '@/lib/social/config';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M14.5 3c.4 2.6 1.9 4.4 4.5 4.7v3.1c-1.5 0-2.9-.5-4.1-1.3v6.8A6.3 6.3 0 1 1 7.2 10v3.2a3.1 3.1 0 1 0 2.2 3V3h5.1Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M14.7 10.3 21.2 3h-2.2l-5.2 5.9L9.4 3H3.5l7 9.9L3.5 21h2.2l5.7-6.5 4.7 6.5h5.9l-7.3-10.7Zm-2 2.3-.7-.9-5.2-6.7h2.2l4.2 5.4.7.9 5.5 7.1h-2.2l-4.5-5.8Z" />
    </svg>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const className =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e5e7] text-[#1d1d1f] transition-colors hover:border-violet-300 hover:text-violet-600 dark:border-[#333] dark:text-[#fafafa] dark:hover:border-violet-500 dark:hover:text-violet-400';
  if (!href) {
    return (
      <span className={`${className} opacity-50`} title={`${label} (próximamente)`} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} aria-label={label}>
      {children}
    </a>
  );
}

export default function SocialIcons({ social }: { social: SocialConfig }) {
  return (
    <div className="mt-4 flex items-center gap-2" aria-label="Redes sociales de AVENTA">
      <SocialLink href={social.tiktok} label="TikTok">
        <TikTokIcon className="h-4 w-4" />
      </SocialLink>
      <SocialLink href={social.instagram} label="Instagram">
        <InstagramIcon className="h-4 w-4" />
      </SocialLink>
      <SocialLink href={social.x} label="X">
        <XIcon className="h-4 w-4" />
      </SocialLink>
    </div>
  );
}
