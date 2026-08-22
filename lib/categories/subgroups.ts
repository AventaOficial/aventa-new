import type { CategoryId } from '@/lib/categories';
import { normalizeCategoryForStorage } from '@/lib/categories';
import type { CategorySubgroup } from '@/lib/categories/subgroupTypes';
import { CATEGORY_SUBGROUPS_DATA } from '@/lib/categories/subgroupsData';

export type { CategorySubgroup } from '@/lib/categories/subgroupTypes';

export const CATEGORY_SUBGROUPS: Partial<Record<CategoryId, CategorySubgroup[]>> = CATEGORY_SUBGROUPS_DATA;

function normalizeHaystack(parts: Array<string | null | undefined>): string {
  return ` ${parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')} `;
}

function hayIncludes(hay: string, keyword: string): boolean {
  const k = keyword
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!k) return false;
  if (k.length <= 3) {
    return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay);
  }
  return hay.includes(` ${k} `);
}

export function getSubgroupsForCategory(category: string | null | undefined): CategorySubgroup[] {
  const norm = normalizeCategoryForStorage(category);
  if (!norm || norm === 'other') return [];
  return CATEGORY_SUBGROUPS[norm] ?? [];
}

export function findSubgroup(
  category: string | null | undefined,
  subslug: string
): CategorySubgroup | null {
  const slug = subslug.trim().toLowerCase();
  return getSubgroupsForCategory(category).find((s) => s.slug === slug) ?? null;
}

export function findSubgroupBySlug(subslug: string): { category: CategoryId; subgroup: CategorySubgroup } | null {
  const slug = subslug.trim().toLowerCase();
  for (const [cat, list] of Object.entries(CATEGORY_SUBGROUPS) as [CategoryId, CategorySubgroup[]][]) {
    const hit = list?.find((s) => s.slug === slug);
    if (hit) return { category: cat, subgroup: hit };
  }
  return null;
}

export function inferSubgroupTagsFromTitle(
  title: string,
  category?: string | null,
  description?: string | null
): string[] {
  const hay = normalizeHaystack([title, description]);
  const tags = new Set<string>();

  const scan = (groups: CategorySubgroup[]) => {
    for (const g of groups) {
      if (g.keywords.some((kw) => hayIncludes(hay, kw))) {
        for (const t of g.tags) tags.add(t);
        tags.add(g.slug);
      }
    }
  };

  const norm = normalizeCategoryForStorage(category ?? null);
  if (norm && norm !== 'other') {
    scan(getSubgroupsForCategory(norm));
  } else {
    for (const list of Object.values(CATEGORY_SUBGROUPS)) {
      if (list) scan(list);
    }
  }

  return [...tags];
}

export function listAllSubgroupRoutes(): Array<{ category: CategoryId; subgroup: CategorySubgroup }> {
  const out: Array<{ category: CategoryId; subgroup: CategorySubgroup }> = [];
  for (const [cat, list] of Object.entries(CATEGORY_SUBGROUPS) as [CategoryId, CategorySubgroup[]][]) {
    if (!list) continue;
    for (const subgroup of list) {
      out.push({ category: cat, subgroup });
    }
  }
  return out;
}
