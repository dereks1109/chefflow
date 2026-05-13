import Decimal from 'decimal.js';

// All weights normalized to grams; volumes to milliliters.
const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495231,
  lb: 453.59237,
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  L: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  'fl oz': 29.5735,
  pt: 473.176,
  qt: 946.353,
  gal: 3785.41,
};

function dimensionOf(unit: string): 'weight' | 'volume' | 'temperature' | null {
  if (unit in WEIGHT_TO_GRAMS) return 'weight';
  if (unit in VOLUME_TO_ML) return 'volume';
  if (unit === 'C' || unit === 'F') return 'temperature';
  return null;
}

export function convertUnit(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const fromDim = dimensionOf(from);
  const toDim = dimensionOf(to);
  if (fromDim === null || toDim === null) {
    throw new Error(`Unknown unit: ${from} or ${to}`);
  }
  if (fromDim !== toDim) {
    throw new Error(`Cannot convert ${from} (${fromDim}) to ${to} (${toDim})`);
  }
  if (fromDim === 'temperature') {
    return convertTemperature(amount, from as 'C' | 'F', to as 'C' | 'F');
  }
  const table = fromDim === 'weight' ? WEIGHT_TO_GRAMS : VOLUME_TO_ML;
  const base = new Decimal(amount).mul(table[from]);
  return base.div(table[to]).toNumber();
}

function convertTemperature(amount: number, from: 'C' | 'F', to: 'C' | 'F'): number {
  if (from === to) return amount;
  if (from === 'C' && to === 'F') return amount * 9 / 5 + 32;
  return (amount - 32) * 5 / 9;
}
