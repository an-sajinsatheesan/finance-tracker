/** Label used for grouping: custom categories use their own name. Categories are Lookup rows of type "category". */
export const categoryLabel = (category: string, customCategory?: string | null) =>
  category === 'Custom' && customCategory ? customCategory : category;
