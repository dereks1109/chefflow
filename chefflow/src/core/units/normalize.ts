import Decimal from 'decimal.js';
import type { UnitSystem } from '../types';

export interface Measurement {
  amount: number;
  unit: string;
}

export function normalizeMeasurement(
  amount: number,
  unit: string,
  system: UnitSystem
): Measurement {
  if (system === 'metric') {
    if (unit === 'g' && amount >= 1000) {
      return { amount: roundSensible(amount / 1000), unit: 'kg' };
    }
    if (unit === 'ml' && amount >= 1000) {
      return { amount: roundSensible(amount / 1000), unit: 'L' };
    }
  } else if (system === 'imperial') {
    if (unit === 'oz' && amount >= 16) {
      return { amount: roundSensible(amount / 16), unit: 'lb' };
    }
  }
  return { amount: roundSensible(amount), unit };
}

export function roundSensible(amount: number): number {
  // Whole numbers stay exact.
  if (Number.isInteger(amount)) return amount;
  const d = new Decimal(amount);
  const abs = d.abs().toNumber();
  let step: number;
  if (abs > 100) step = 0.5;
  else if (abs >= 10) step = 0.1;
  else step = 0.25;
  return d.div(step).round().mul(step).toNumber();
}
