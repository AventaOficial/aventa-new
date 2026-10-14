import { parseOfferSteps } from '@/lib/offers/offerSteps';

export default function OfferStepsList({ steps, className = '' }: { steps: string | null | undefined; className?: string }) {
  const items = parseOfferSteps(steps);
  if (items.length === 0) return null;
  return (
    <ol className={`space-y-2.5 ${className}`}>
      {items.map((text, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white shadow-sm dark:bg-violet-500"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="pt-0.5 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{text}</span>
        </li>
      ))}
    </ol>
  );
}
