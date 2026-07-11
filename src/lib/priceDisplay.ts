export interface PriceDisplayInput {
  is_free?: boolean | null;
  price_min?: number | null;
  price_max?: number | null;
}

export interface PriceDisplay {
  label: string;
  isFree: boolean;
}

function formatPriceNumber(value: number): string {
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

/**
 * Single source of truth for how a price is displayed to consumers.
 * is_free (or a verified $0 minimum) always wins; a missing/null price_min
 * is never treated as free.
 */
export function getPriceDisplay(event: PriceDisplayInput): PriceDisplay {
  const { is_free, price_min, price_max } = event;

  if (is_free === true || price_min === 0) {
    return { label: 'Free', isFree: true };
  }

  const hasMin = price_min !== null && price_min !== undefined;
  const hasMax = price_max !== null && price_max !== undefined;

  if (hasMin && hasMax) {
    const min = formatPriceNumber(price_min as number);
    const max = formatPriceNumber(price_max as number);
    return {
      label: price_min === price_max ? `$${min}` : `$${min}–$${max}`,
      isFree: false,
    };
  }

  if (hasMin) {
    return { label: `From $${formatPriceNumber(price_min as number)}`, isFree: false };
  }

  return { label: 'Price not listed', isFree: false };
}
