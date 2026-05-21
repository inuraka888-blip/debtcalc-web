export type AmountCents = number;

const CENTS_PER_UNIT = 100;

export function assertValidAmountCents(amountCents: number): asserts amountCents is AmountCents {
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error("Money amount must be a safe integer number of cents.");
  }
}

export function addCents(...amounts: AmountCents[]): AmountCents {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  assertValidAmountCents(total);
  return total;
}

export function absCents(amountCents: AmountCents): AmountCents {
  const result = Math.abs(amountCents);
  assertValidAmountCents(result);
  return result;
}

export function parseMoneyToCents(value: string): AmountCents | null {
  const amountCents = parseNonNegativeMoneyToCents(value);
  if (amountCents === null || amountCents <= 0) {
    return null;
  }

  return amountCents;
}

export function parseNonNegativeMoneyToCents(value: string): AmountCents | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const [units, cents = ""] = normalized.split(".");
  const amountCents = Number(units) * CENTS_PER_UNIT + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    return null;
  }

  return amountCents;
}

export function formatMoney(amountCents: AmountCents, locale = "en"): string {
  assertValidAmountCents(amountCents);

  return new Intl.NumberFormat(normalizeMoneyLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / CENTS_PER_UNIT);
}

function normalizeMoneyLocale(locale: string): string {
  return locale.startsWith("ru") ? "ru-RU" : "en-US";
}

export function splitEqually(amountCents: AmountCents, userIds: string[]): Record<string, AmountCents> {
  assertValidAmountCents(amountCents);
  if (amountCents <= 0 || userIds.length === 0) {
    return {};
  }

  const baseShare = Math.floor(amountCents / userIds.length);
  let remainder = amountCents % userIds.length;

  return [...userIds].sort().reduce<Record<string, AmountCents>>((splits, userId) => {
    const extraCent = remainder > 0 ? 1 : 0;
    splits[userId] = baseShare + extraCent;
    remainder -= extraCent;
    return splits;
  }, {});
}
