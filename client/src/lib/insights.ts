import { categoryLabel, money } from './format';

/**
 * Money check-up: well-known rules of thumb (50/30/20, savings rate, rent and debt
 * share of income, emergency fund) applied to a person's month. General guidelines,
 * not personal financial advice.
 */

export type Bucket = 'needs' | 'wants' | 'debt' | 'family' | 'invest';
export type Level = 'good' | 'watch' | 'alert' | 'info';
export interface Insight { key: string; level: Level; title: string; detail: string }
export interface SpendLine { category: string; custom?: string; amount: number }

const NEEDS = new Set(['Rent', 'Utilities', 'Internet', 'Mobile', 'Grocery', 'Medical', 'Insurance', 'Education', 'Fuel']);
const DEBT = new Set(['Home Loan', 'EMI', 'Car Loan', 'Credit Card']);
const WANTS = new Set(['Travel', 'Dining', 'Shopping', 'Subscription']);

/** Which part of the 50/30/20 rule a category belongs to (custom ones by their name). */
export function bucketOf(category: string, custom = ''): Bucket {
  if (category === 'Family Support') return 'family';
  if (category === 'Chitti') return 'invest'; // a chit fund builds savings
  if (DEBT.has(category)) return 'debt';
  if (NEEDS.has(category)) return 'needs';
  if (WANTS.has(category)) return 'wants';
  const name = `${category} ${custom}`.toLowerCase();
  if (/dewa|util|gas|water|electric|rent|grocer|medical|clinic|pharma|school|fee|insur|transport|taxi|metro|salik|fuel/.test(name)) return 'needs';
  if (/loan|emi|card|instal/.test(name)) return 'debt';
  if (/chit|sip|invest|saving|gold|deposit/.test(name)) return 'invest';
  return 'wants';
}

export interface CheckUp {
  income: number; spent: number;
  buckets: Record<Bucket, number>;
  /** 50/30/20 shares of income (savings includes chitti / investments). */
  split: { needs: number; wants: number; savings: number };
  insights: Insight[];
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const p = (v: number) => `${Math.round(v)}%`;

export function checkUp(input: { income: number; lines: SpendLine[]; cash?: number | null }): CheckUp {
  const { income, lines } = input;
  const buckets: Record<Bucket, number> = { needs: 0, wants: 0, debt: 0, family: 0, invest: 0 };
  for (const l of lines) buckets[bucketOf(l.category, l.custom)] += l.amount;
  const spent = lines.reduce((a, l) => a + l.amount, 0);
  const kept = income - spent;
  const essentials = buckets.needs + buckets.debt + buckets.family;
  const split = { needs: pct(essentials, income), wants: pct(buckets.wants, income), savings: pct(kept + buckets.invest, income) };
  const out: Insight[] = [];

  if (income <= 0) {
    out.push({ key: 'income', level: 'info', title: 'No income received yet this month', detail: 'Mark the salary as received to see how this month measures up.' });
    return { income, spent, buckets, split, insights: out };
  }

  // Savings rate (kept money plus money put into chitti / investments).
  const rate = split.savings;
  out.push(rate < 0
    ? { key: 'savings', level: 'alert', title: `Spent ${money(-kept)} more than earned`, detail: 'Spending is above income this month. A common first step is pausing wants until the month is back in balance.' }
    : rate >= 20
      ? { key: 'savings', level: 'good', title: `Saving ${p(rate)} of income`, detail: `Meets the common guideline of saving at least 20% (here ${money(income * 0.2)}).` }
      : { key: 'savings', level: rate >= 10 ? 'watch' : 'alert', title: `Saving ${p(rate)} of income`, detail: `The common guideline is at least 20%: ${money(income * 0.2)} a month, ${money(income * 0.2 - (kept + buckets.invest))} more than now.` });

  // 50/30/20: essentials (needs, family support, debt payments) up to 50%, wants up to 30%.
  out.push(split.needs <= 50
    ? { key: 'needs', level: 'good', title: `Essentials are ${p(split.needs)} of income`, detail: 'Within the 50% the 50/30/20 rule allows for needs, family support and loan payments.' }
    : { key: 'needs', level: split.needs <= 65 ? 'watch' : 'alert', title: `Essentials are ${p(split.needs)} of income`, detail: `The 50/30/20 rule keeps these near 50% (${money(income * 0.5)}). Fixed costs like rent and EMIs are the usual places to look when renewing.` });
  if (buckets.wants > 0) {
    out.push(split.wants <= 30
      ? { key: 'wants', level: 'good', title: `Wants are ${p(split.wants)} of income`, detail: 'Dining, shopping, travel and subscriptions are within the 30% guideline.' }
      : { key: 'wants', level: 'watch', title: `Wants are ${p(split.wants)} of income`, detail: `Above the 30% guideline (${money(income * 0.3)}); trimming ${money(buckets.wants - income * 0.3)} would bring it in line.` });
  }

  // Rent: commonly kept at or under 30% of income.
  const rent = lines.filter((l) => l.category === 'Rent' || /rent/i.test(l.custom ?? '')).reduce((a, l) => a + l.amount, 0);
  if (rent > 0) {
    const r = pct(rent, income);
    out.push({ key: 'rent', level: r <= 30 ? 'good' : r <= 40 ? 'watch' : 'alert', title: `Rent is ${p(r)} of income`, detail: r <= 30 ? 'Within the common 30% housing guideline.' : `Above the common 30% housing guideline (${money(income * 0.3)}).` });
  }

  // Debt-to-income: loan, EMI and card payments, commonly kept at or under 36%.
  if (buckets.debt > 0) {
    const d = pct(buckets.debt, income);
    out.push({
      key: 'debt', level: d <= 36 ? (d <= 20 ? 'good' : 'watch') : 'alert', title: `Loan and card payments are ${p(d)} of income`,
      detail: d <= 36 ? 'Within the 36% debt-to-income guideline lenders commonly use.' : 'Above the 36% debt-to-income guideline; paying down the costliest debt first (usually credit cards) frees the most money.',
    });
  }

  // Emergency fund: cash in the bank against a month of essentials, commonly 3–6 months.
  if (input.cash != null && essentials > 0) {
    const months = input.cash / essentials;
    out.push({
      key: 'emergency', level: months >= 6 ? 'good' : months >= 3 ? 'watch' : 'alert', title: `Bank balance covers ${months.toFixed(1)} months of essentials`,
      detail: months >= 6 ? 'Meets the 3–6 month emergency fund guideline.' : `The common guideline is 3–6 months (${money(essentials * 3)}–${money(essentials * 6)}).`,
    });
  }

  if (buckets.family > 0) out.push({ key: 'family', level: 'info', title: `Family support is ${p(pct(buckets.family, income))} of income`, detail: `${money(buckets.family)} this month, counted with essentials.` });
  if (buckets.invest > 0) out.push({ key: 'invest', level: 'good', title: `${money(buckets.invest)} into chitti / investments`, detail: 'Counted as savings in the 50/30/20 split.' });
  const top = [...lines].sort((a, b) => b.amount - a.amount)[0];
  if (top && spent > 0) out.push({ key: 'top', level: 'info', title: `Biggest spend: ${categoryLabel(top.category, top.custom)}`, detail: `${money(top.amount)}, ${p(pct(top.amount, spent))} of this month’s spending.` });

  return { income, spent, buckets, split, insights: out };
}
