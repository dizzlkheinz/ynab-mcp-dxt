// money.ts
export type Milli = number; // integer milliunits (no bigint)

export const toMilli = (x: number | string): Milli => {
  const n = Number(x);
  const m = Math.round(n * 1000);
  if (!Number.isFinite(n) || !Number.isSafeInteger(m)) {
    throw new Error(`Invalid/unsafe amount: ${x}`);
  }
  return m;
};

export const fromMilli = (m: Milli): number => m / 1000;

export const assertMilli = (m: number, msg = 'Expected safe integer milliunits') => {
  if (!Number.isSafeInteger(m)) throw new Error(msg);
};

export const addMilli = (a: Milli, b: Milli): Milli => {
  const s = a + b;
  if (!Number.isSafeInteger(s)) throw new Error('Milliunit sum overflow');
  return s;
};

export const inWindow = (iso: string, start?: string, end?: string) =>
  (!start || iso >= start) && (!end || iso <= end);
