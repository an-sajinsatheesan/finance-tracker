export const CATEGORIES = [
  'Rent', 'DEWA/Utilities', 'Internet', 'Grocery', 'Home Loan', 'EMI', 'Chitti',
  'Family Support', 'Travel', 'Insurance', 'Subscription', 'Custom',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Label used for grouping: custom categories use their own name. */
export const categoryLabel = (category: string, customCategory?: string | null) =>
  category === 'Custom' && customCategory ? customCategory : category;
