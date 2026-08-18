import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function LegalBackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Volver al inicio
    </Link>
  );
}
