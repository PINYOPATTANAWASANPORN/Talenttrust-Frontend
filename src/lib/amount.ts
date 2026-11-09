/**
 * Precise decimal amount handling and stroop conversion using bigint.
 *
 * Implements Issue #1468: replaces floating-point JavaScript numbers with exact
 * 7-decimal stroop bigint arithmetic across the UI to eliminate rounding artifacts
 * (e.g., 0.30000000000000004 XLM) and incorrect comparison guards.
 */

export const DEFAULT_DECIMALS = 7;
export const STROOPS_FACTOR = 10_000_000n; // 10^7

export type AmountErrorCode =
  | 'EMPTY_INPUT'
  | 'INVALID_FORMAT'
  | 'EXPONENT_NOT_ALLOWED'
  | 'NEGATIVE_NOT_ALLOWED'
  | 'TOO_MANY_DECIMALS';

export class AmountError extends Error {
  readonly code: AmountErrorCode;

  constructor(code: AmountErrorCode, message: string) {
    super(message);
    this.name = 'AmountError';
    this.code = code;
  }
}

export interface ParseAmountOptions {
  decimals?: number;
  allowNegative?: boolean;
  allowGrouping?: boolean;
}

export interface FormatAmountOptions {
  token?: string;
  locale?: string;
  decimals?: number;
  maxFractionDigits?: number;
  trimTrailingZeros?: boolean;
  useGrouping?: boolean;
}

/**
 * Parse a decimal string into exact integer stroops (bigint).
 *
 * Accepts:
 * - Integers: "1", "123", "0"
 * - Decimals: "1.5", ".5", "0.0000001"
 * - Grouped integers (if allowGrouping=true): "1,000.25"
 *
 * Rejects:
 * - Empty or whitespace-only strings
 * - Exponent/scientific notation (e.g. "1e3", "1E-7")
 * - Negatives (unless allowNegative=true)
 * - Fractions with more than `decimals` places
 * - Non-numeric strings
 */
export function parseAmount(input: string, optionsOrDecimals?: number | ParseAmountOptions): bigint {
  const options: ParseAmountOptions =
    typeof optionsOrDecimals === 'number'
      ? { decimals: optionsOrDecimals }
      : (optionsOrDecimals ?? {});

  const decimals = options.decimals ?? DEFAULT_DECIMALS;
  const allowNegative = options.allowNegative ?? false;
  const allowGrouping = options.allowGrouping ?? true;

  if (typeof input !== 'string') {
    throw new AmountError('INVALID_FORMAT', 'Amount input must be a string');
  }

  const trimmed = input.trim();
  if (trimmed === '') {
    throw new AmountError('EMPTY_INPUT', 'Amount cannot be empty or whitespace-only');
  }

  // Reject scientific notation
  if (/[eE]/.test(trimmed)) {
    throw new AmountError('EXPONENT_NOT_ALLOWED', `Exponent notation is not allowed: "${input}"`);
  }

  let sanitized = trimmed;
  let isNegative = false;

  if (sanitized.startsWith('-')) {
    if (!allowNegative) {
      throw new AmountError('NEGATIVE_NOT_ALLOWED', `Negative amounts are not allowed: "${input}"`);
    }
    isNegative = true;
    sanitized = sanitized.slice(1);
  } else if (sanitized.startsWith('+')) {
    sanitized = sanitized.slice(1);
  }

  // Handle grouping commas if allowed (e.g. 1,000.50)
  if (allowGrouping && sanitized.includes(',')) {
    // Validate comma grouping: must be digits before comma, comma followed by 3 digits
    const commaParts = sanitized.split('.');
    if (!/^\d{1,3}(,\d{3})+$/.test(commaParts[0]) && !/^\d+$/.test(commaParts[0])) {
      throw new AmountError('INVALID_FORMAT', `Invalid comma grouping in amount: "${input}"`);
    }
    sanitized = sanitized.replace(/,/g, '');
  }

  // Must match integer or decimal: digits optionally followed by dot and digits, or leading dot
  if (!/^\d+(\.\d*)?$/.test(sanitized) && !/^\.\d+$/.test(sanitized)) {
    throw new AmountError('INVALID_FORMAT', `Invalid decimal number format: "${input}"`);
  }

  const dotIndex = sanitized.indexOf('.');
  let intStr: string;
  let fracStr: string;

  if (dotIndex === -1) {
    intStr = sanitized;
    fracStr = '';
  } else {
    intStr = sanitized.slice(0, dotIndex) || '0';
    fracStr = sanitized.slice(dotIndex + 1);
  }

  if (fracStr.length > decimals) {
    throw new AmountError(
      'TOO_MANY_DECIMALS',
      `Amount has ${fracStr.length} decimal places, exceeding maximum of ${decimals}: "${input}"`,
    );
  }

  const paddedFrac = fracStr.padEnd(decimals, '0');
  const factor = 10n ** BigInt(decimals);
  const result = BigInt(intStr) * factor + (paddedFrac ? BigInt(paddedFrac) : 0n);

  return isNegative ? -result : result;
}

/**
 * Safely convert an API decimal number to integer stroops (bigint) via string path.
 *
 * Precision Limit Note: JavaScript numbers above Number.MAX_SAFE_INTEGER (9,007,199,254,740,991)
 * or with extreme precision can lose precision before this call.
 */
export function fromApiNumber(n: number, decimals = DEFAULT_DECIMALS): bigint {
  if (typeof n !== 'number' || Number.isNaN(n) || !Number.isFinite(n)) {
    throw new AmountError('INVALID_FORMAT', `Invalid API number: ${n}`);
  }
  if (n < 0) {
    throw new AmountError('NEGATIVE_NOT_ALLOWED', `API amount cannot be negative: ${n}`);
  }
  // Convert through fixed-point string to prevent float representation artifacts
  const fixed = n.toFixed(decimals);
  return parseAmount(fixed, { decimals, allowNegative: false });
}

/**
 * Convert integer stroops (bigint) back to an API decimal number for request bodies.
 */
export function toApiNumber(b: bigint, decimals = DEFAULT_DECIMALS): number {
  const factor = 10n ** BigInt(decimals);
  const isNeg = b < 0n;
  const abs = isNeg ? -b : b;
  const intPart = abs / factor;
  const fracPart = abs % factor;
  const fracStr = fracPart.toString().padStart(decimals, '0');
  const numStr = `${isNeg ? '-' : ''}${intPart}.${fracStr}`;
  return Number(numStr);
}

/**
 * Format integer stroops into a localized, human-readable string.
 *
 * Uses string splitting and BigInt to format the integer part without precision loss,
 * ensuring values up to 2^100 display exactly.
 */
export function formatAmount(b: bigint, options?: FormatAmountOptions): string {
  const decimals = options?.decimals ?? DEFAULT_DECIMALS;
  const maxFractionDigits = options?.maxFractionDigits ?? decimals;
  const trimTrailingZeros = options?.trimTrailingZeros ?? true;
  const useGrouping = options?.useGrouping ?? false;
  const factor = 10n ** BigInt(decimals);

  const isNeg = b < 0n;
  const abs = isNeg ? -b : b;
  const intPart = abs / factor;
  const fracPart = abs % factor;

  const paddedFrac = fracPart.toString().padStart(decimals, '0');
  let truncatedFrac = paddedFrac.slice(0, maxFractionDigits);

  if (trimTrailingZeros) {
    truncatedFrac = truncatedFrac.replace(/0+$/, '');
  }

  const intFormatted = useGrouping ? formatBigIntInteger(intPart, options?.locale) : intPart.toString();

  let formatted = isNeg ? `-${intFormatted}` : intFormatted;
  if (truncatedFrac.length > 0) {
    formatted = `${formatted}.${truncatedFrac}`;
  }

  if (options?.token) {
    formatted = `${formatted} ${options.token}`;
  }

  return formatted;
}

/** Helper to format arbitrarily large bigints with thousand separators */
function formatBigIntInteger(n: bigint, locale?: string): string {
  const s = n.toString();
  // Standard comma grouping
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Math & Comparison Helpers ──────────────────────────────────────────────

export function sumAmounts(list: bigint[]): bigint {
  return list.reduce((acc, v) => acc + v, 0n);
}

export function subAmounts(a: bigint, b: bigint): bigint {
  return a - b;
}

export function addAmounts(a: bigint, b: bigint): bigint {
  return a + b;
}

export function gteAmounts(a: bigint, b: bigint): boolean {
  return a >= b;
}

export function gtAmounts(a: bigint, b: bigint): boolean {
  return a > b;
}

/**
 * Compute progress percentage as an integer (0-100) using integer math.
 */
export function computeProgressPercentage(released: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  if (released <= 0n) return 0;
  if (released >= total) return 100;

  // Round half-up: ((released * 100n) + (total / 2n)) / total
  const pct = (released * 1000n) / total;
  const rounded = Number((pct + 5n) / 10n);
  return Math.min(100, Math.max(0, rounded));
}
