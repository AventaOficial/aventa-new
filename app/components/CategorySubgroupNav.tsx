import Link from 'next/link';
import type { CategorySubgroup } from '@/lib/categories/subgroups';

type Props = {
  categorySlug: string;
  categoryLabel: string;
  subgroups: CategorySubgroup[];
  activeSubslug?: string;
};

export default function CategorySubgroupNav({
  categorySlug,
  categoryLabel,
  subgroups,
  activeSubslug,
}: Props) {
  if (subgroups.length === 0) return null;

  return (
    <div className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
        Subcategorías en {categoryLabel}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/categoria/${categorySlug}`}
          className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
            !activeSubslug
              ? 'bg-violet-600 text-white border-violet-600'
              : 'bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-violet-400'
          }`}
        >
          Todas
        </Link>
        {subgroups.map((s) => (
          <Link
            key={s.slug}
            href={`/categoria/${categorySlug}/${s.slug}`}
            className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
              activeSubslug === s.slug
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-violet-400'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
