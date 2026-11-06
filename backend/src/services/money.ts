import Decimal from 'decimal.js';
import { Types } from 'mongoose';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

const DECIMAL_TEXT = /^-?(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

export function parseMoney(value: string): Decimal {
  const text = value.trim();
  if (!DECIMAL_TEXT.test(text) || text.replace(/[-.]/g, '').replace(/^0+/, '').length > 34) {
    throw new TypeError('Money value must be a plain decimal string within Decimal128 precision.');
  }
  const decimal = new Decimal(text);
  if (!decimal.isFinite()) throw new TypeError('Money value must be finite.');
  return decimal;
}

export function decimal128(value: string): Types.Decimal128 {
  parseMoney(value);
  return Types.Decimal128.fromString(value);
}

export function addMoney(left: string, right: string): string {
  return parseMoney(left).plus(parseMoney(right)).toString();
}

export function subtractMoney(left: string, right: string): string {
  return parseMoney(left).minus(parseMoney(right)).toString();
}

export function signedMoney(amount: string, direction: 'credit' | 'debit'): string {
  const value = parseMoney(amount);
  return (direction === 'credit' ? value : value.negated()).toString();
}

export function serializeMoney(value: Types.Decimal128 | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : value.toString();
}
