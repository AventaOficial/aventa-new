import type { CategoryId } from '@/lib/categories';

import { normalizeCategoryForStorage } from '@/lib/categories';

import {

  findSubgroupBySlug,

  getSubgroupsForCategory,

  listAllSubgroupRoutes,

  type CategorySubgroup,

} from '@/lib/categories/subgroups';

import { inferOfferCategory } from '@/lib/offers/inferOfferCategory';

import { slugifyTag } from '@/lib/offers/tagSlug';



export type OfferAutogroupResult = {

  category: CategoryId | null;

  subgroup: CategorySubgroup | null;

  subgroupSlug: string | null;

  subgroupLabel: string | null;

  tags: string[];

};



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



function scoreSubgroup(g: CategorySubgroup, hay: string): number {

  if (g.excludeKeywords?.some((kw) => hayIncludes(hay, kw))) return 0;



  let score = 0;

  let matches = 0;

  for (const kw of g.keywords) {

    if (hayIncludes(hay, kw)) {

      matches++;

      // Cuadrado de longitud: frases largas ganan a tokens genéricos ("tv" vs "smart tv").

      score += Math.min(kw.length, 32) ** 2;

    }

  }

  if (matches === 0) return 0;

  score += matches * 8;

  return score;

}



/** Mejor subgrupo por coincidencia de keywords (tipo de producto, no copia de marcas PD). */

export function inferPrimarySubgroup(

  title: string,

  category?: CategoryId | null,

  description?: string | null

): CategorySubgroup | null {

  const hay = normalizeHaystack([title, description]);

  const pool =

    category && category !== 'other'

      ? getSubgroupsForCategory(category)

      : listAllSubgroupRoutes().map((r) => r.subgroup);



  let best: { subgroup: CategorySubgroup; score: number } | null = null;

  for (const g of pool) {

    const score = scoreSubgroup(g, hay);

    if (score > 0 && (!best || score > best.score)) {

      best = { subgroup: g, score };

    }

  }

  return best?.subgroup ?? null;

}



/**

 * Macro + subgrupo + tags al publicar (bot o usuario).

 * Si no hay categoría, infiere macro y subgrupo desde título.

 */

export function inferOfferAutogroup(input: {

  title: string;

  store?: string | null;

  category?: string | null;

  description?: string | null;

  extraTags?: string[];

}): OfferAutogroupResult {

  let category =

    normalizeCategoryForStorage(input.category ?? null) ??

    inferOfferCategory({

      title: input.title,

      breadcrumbs: input.store ? [input.store] : undefined,

    });



  const categoryFromTitle = inferOfferCategory({

    title: input.title,

    breadcrumbs: input.store ? [input.store] : undefined,

  });



  if (categoryFromTitle && category && categoryFromTitle !== category) {

    const hay = normalizeHaystack([input.title, input.description]);

    const sgTitle = inferPrimarySubgroup(input.title, categoryFromTitle, input.description);

    const sgStored = inferPrimarySubgroup(input.title, category, input.description);

    const scoreTitle = sgTitle ? scoreSubgroup(sgTitle, hay) : 0;

    const scoreStored = sgStored ? scoreSubgroup(sgStored, hay) : 0;

    if (scoreTitle > scoreStored) category = categoryFromTitle;

  } else if (categoryFromTitle && !category) {

    category = categoryFromTitle;

  }



  let subgroup = inferPrimarySubgroup(input.title, category, input.description);



  if (!category && subgroup) {

    const hit = findSubgroupBySlug(subgroup.slug);

    if (hit) category = hit.category;

  }



  // Si el subgrupo pertenece a otra macro con señal fuerte, corregir macro.

  if (subgroup) {

    const hit = findSubgroupBySlug(subgroup.slug);

    if (hit && category && hit.category !== category) {

      const hay = normalizeHaystack([input.title, input.description]);

      const currentScore = scoreSubgroup(

        getSubgroupsForCategory(category).find((s) => s.slug === subgroup!.slug) ?? subgroup,

        hay

      );

      const targetScore = scoreSubgroup(subgroup, hay);

      if (targetScore > currentScore || !getSubgroupsForCategory(category).some((s) => s.slug === subgroup!.slug)) {

        category = hit.category;

      }

    }

  }



  if (category && !subgroup) {

    subgroup = inferPrimarySubgroup(input.title, category, input.description);

  }



  const tags = new Set<string>();

  if (subgroup) {

    tags.add(subgroup.slug);

    for (const t of subgroup.tags) tags.add(t);

  }

  if (category && category !== 'other') tags.add(category);



  if (input.store?.trim()) {

    const storeTag = slugifyTag(input.store);

    if (storeTag.length >= 2) tags.add(storeTag);

  }



  for (const e of input.extraTags ?? []) {

    const s = slugifyTag(e);

    if (s) tags.add(s);

  }



  const titleWords = input.title

    .toLowerCase()

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '')

    .split(/[^a-z0-9]+/)

    .filter((w) => w.length >= 4 && w.length <= 24);

  for (const w of titleWords.slice(0, 5)) tags.add(w);



  const ordered: string[] = [];

  if (subgroup) {

    ordered.push(subgroup.slug);

    for (const t of tags) {

      if (t !== subgroup.slug) ordered.push(t);

    }

  } else {

    ordered.push(...tags);

  }



  return {

    category,

    subgroup,

    subgroupSlug: subgroup?.slug ?? null,

    subgroupLabel: subgroup?.label ?? null,

    tags: [...new Set(ordered)].slice(0, 20),

  };

}

