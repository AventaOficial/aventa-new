import { ScrollText } from 'lucide-react';

export default function OfferConditionsBlock({ conditions }: { conditions: string | null | undefined }) {
  const text = conditions?.trim();
  if (!text) return null;
  return (
    <div>
      <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <ScrollText className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
        Condiciones
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{text}</p>
    </div>
  );
}
