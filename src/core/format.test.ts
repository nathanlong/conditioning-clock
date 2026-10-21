import { expect, test } from 'vitest';
import { format } from './format';

test.each([
  [0, '0:00'],
  [1, '0:01'],
  [59, '0:59'],
  [60, '1:00'],
  [600, '10:00'],
  [3599, '59:59'],
  [3600, '1:00:00'],
  [3661, '1:01:01'],
  [36000, '10:00:00'],
])('formats %i seconds as %s', (seconds, text) => {
  expect(format(seconds)).toBe(text);
});

test('drops fractions and clamps negatives to zero', () => {
  expect(format(59.9)).toBe('0:59');
  expect(format(-3)).toBe('0:00');
});
