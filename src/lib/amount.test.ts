import { describe, expect, it } from 'vitest';
import {
  addAmounts,
  AmountError,
  computeProgressPercentage,
  formatAmount,
  fromApiNumber,
  gteAmounts,
  parseAmount,
  subAmounts,
  sumAmounts,
  toApiNumber,
} from './amount';

describe('amount module', () => {
  describe('parseAmount', () => {
    it('parses whole numbers and decimals correctly', () => {
      expect(parseAmount('1')).toBe(10_000_000n);
      expect(parseAmount('1.5')).toBe(15_000_000n);
      expect(parseAmount('.5')).toBe(5_000_000n);
      expect(parseAmount('0.0000001')).toBe(1n);
      expect(parseAmount('0')).toBe(0n);
      expect(parseAmount('1000')).toBe(10_000_000_000n);
    });

    it('parses numbers with valid grouping commas', () => {
      expect(parseAmount('1,000.25')).toBe(10_002_500_000n);
      expect(parseAmount('1,000,000')).toBe(10_000_000_000_000n);
    });

    it('rejection table: rejects invalid inputs with typed AmountError', () => {
      const rejections = [
        { input: '', code: 'EMPTY_INPUT' },
        { input: '   ', code: 'EMPTY_INPUT' },
        { input: '1e3', code: 'EXPONENT_NOT_ALLOWED' },
        { input: '1E-7', code: 'EXPONENT_NOT_ALLOWED' },
        { input: '-1', code: 'NEGATIVE_NOT_ALLOWED' },
        { input: '-0.5', code: 'NEGATIVE_NOT_ALLOWED' },
        { input: '1.12345678', code: 'TOO_MANY_DECIMALS' },
        { input: 'abc', code: 'INVALID_FORMAT' },
        { input: '1.2.3', code: 'INVALID_FORMAT' },
        { input: '1,00,00', code: 'INVALID_FORMAT' },
      ];

      for (const { input, code } of rejections) {
        expect(
          () => parseAmount(input),
          `Expected input "${input}" to be rejected with code ${code}`,
        ).toThrowError(AmountError);

        try {
          parseAmount(input);
        } catch (err) {
          expect((err as AmountError).code).toBe(code);
        }
      }
    });

    it('supports allowNegative option when explicitly set', () => {
      expect(parseAmount('-1.5', { allowNegative: true })).toBe(-15_000_000n);
      expect(parseAmount('-100', { allowNegative: true })).toBe(-1_000_000_000n);
    });
  });

  describe('formatAmount', () => {
    it('formats stroops to decimal strings without precision loss', () => {
      expect(formatAmount(10_000_000n)).toBe('1');
      expect(formatAmount(15_000_000n)).toBe('1.5');
      expect(formatAmount(1n)).toBe('0.0000001');
      expect(formatAmount(10_002_500_000n)).toBe('1000.25');
      expect(formatAmount(10_002_500_000n, { useGrouping: true })).toBe('1,000.25');
    });

    it('formats with token suffix', () => {
      expect(formatAmount(3_000_000n, { token: 'XLM' })).toBe('0.3 XLM');
      expect(formatAmount(100_000_000n, { token: 'USDC' })).toBe('10 USDC');
    });

    it('supports preserving trailing zeros if requested', () => {
      expect(formatAmount(15_000_000n, { trimTrailingZeros: false })).toBe('1.5000000');
    });
  });

  describe('Property-style test: round-trip consistency', () => {
    it('parseAmount(formatAmount(x)) == x for values up to 2^100 stroops', () => {
      // Test known edge values and large powers of 2
      const testValues = [
        0n,
        1n,
        7n,
        10_000_000n,
        123_456_789n,
        1_000_000_000_000_000n,
        2n ** 64n,
        2n ** 80n,
        2n ** 100n,
      ];

      // Add pseudo-random bigints up to 2^100
      for (let i = 0; i < 50; i++) {
        const bits = BigInt(Math.floor(Math.random() * 95) + 5);
        const rand = (2n ** bits) + BigInt(Math.floor(Math.random() * 10_000_000));
        testValues.push(rand);
      }

      for (const val of testValues) {
        const formatted = formatAmount(val);
        const parsed = parseAmount(formatted);
        expect(parsed).toBe(val);
      }
    });
  });

  describe('Regression: 0.1 + 0.2 XLM milestone funded 0.3 XLM', () => {
    it('ensures release guard is true for both milestones and produces exact display without float artifacts', () => {
      // 0.1 XLM = 1_000_000 stroops, 0.2 XLM = 2_000_000 stroops
      const m1 = fromApiNumber(0.1);
      const m2 = fromApiNumber(0.2);
      const totalFunded = fromApiNumber(0.3);

      expect(m1).toBe(1_000_000n);
      expect(m2).toBe(2_000_000n);
      expect(totalFunded).toBe(3_000_000n);

      // Total milestone sum must equal funded
      const sumMilestones = sumAmounts([m1, m2]);
      expect(sumMilestones).toBe(totalFunded);

      // Display checks
      expect(formatAmount(totalFunded, { token: 'XLM' })).toBe('0.3 XLM');
      expect(formatAmount(totalFunded)).toBe('0.3');

      // Release milestone 1
      let released = 0n;
      let inEscrow = subAmounts(totalFunded, released);
      expect(gteAmounts(inEscrow, m1)).toBe(true);

      released = m1;
      inEscrow = subAmounts(totalFunded, released); // 3_000_000n - 1_000_000n = 2_000_000n exactly

      // Milestone 2 must be exactly releasable (no 0.19999999999999998 floating point failure)
      expect(inEscrow).toBe(2_000_000n);
      expect(gteAmounts(inEscrow, m2)).toBe(true);

      released = addAmounts(released, m2);
      inEscrow = subAmounts(totalFunded, released);
      expect(inEscrow).toBe(0n);
    });
  });

  describe('API Number Conversion', () => {
    it('converts between API numbers and bigints safely', () => {
      expect(fromApiNumber(12.345)).toBe(123_450_000n);
      expect(toApiNumber(123_450_000n)).toBe(12.345);

      expect(fromApiNumber(0)).toBe(0n);
      expect(toApiNumber(0n)).toBe(0);
    });

    it('rejects invalid numbers', () => {
      expect(() => fromApiNumber(NaN)).toThrow(AmountError);
      expect(() => fromApiNumber(Infinity)).toThrow(AmountError);
      expect(() => fromApiNumber(-1)).toThrow(AmountError);
    });
  });

  describe('computeProgressPercentage', () => {
    it('computes integer percentages safely', () => {
      expect(computeProgressPercentage(0n, 100n)).toBe(0);
      expect(computeProgressPercentage(50n, 100n)).toBe(50);
      expect(computeProgressPercentage(33n, 100n)).toBe(33);
      expect(computeProgressPercentage(67n, 100n)).toBe(67);
      expect(computeProgressPercentage(100n, 100n)).toBe(100);
      expect(computeProgressPercentage(150n, 100n)).toBe(100);
    });
  });
});
