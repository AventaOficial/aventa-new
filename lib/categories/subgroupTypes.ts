export type CategorySubgroup = {
  slug: string;
  label: string;
  keywords: string[];
  /** Tags secundarios (marca, variante) además del slug del subgrupo. */
  tags: string[];
  /** Si alguna coincide, este subgrupo no aplica (evita falsos positivos). */
  excludeKeywords?: string[];
};
