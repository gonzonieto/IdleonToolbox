import { expect, it } from 'vitest';
import { formatAdvisorNumber } from '../utility/advisor/format';

it('formats large damage and costs with scientific notation', () => {
  expect(formatAdvisorNumber(38432651646198800000000000000)).toBe('3.84e28');
  expect(formatAdvisorNumber(1e6)).toBe('1.00e6');
  expect(formatAdvisorNumber(12500)).toBe('12,500');
  expect(formatAdvisorNumber(7.25)).toBe('7.25');
  expect(formatAdvisorNumber(0)).toBe('0');
  expect(formatAdvisorNumber(NaN)).toBe('Unavailable');
  expect(formatAdvisorNumber(Infinity)).toBe('Unavailable');
});

it('keeps a small positive gain visible instead of rounding it to zero', () => {
  expect(formatAdvisorNumber(0.0000025)).toBe('2.50e-6');
});
