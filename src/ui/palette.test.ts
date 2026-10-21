import { describe, expect, test } from 'vitest';
import css from '../styles.css?raw';

/** The color tokens declared on :root. */
function tokens(source: string): Record<string, string> {
  const root = source.match(/:root\s*{([^}]*)}/)![1]!;
  return Object.fromEntries(
    [...root.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [
      m[1]!,
      m[2]!.toLowerCase(),
    ]),
  );
}

type RGB = [number, number, number];
const rgb = (hex: string): RGB =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB;
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const fromLinear = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

function luminance(c: RGB): number {
  const [r, g, b] = c.map(toLinear) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Machado et al. (2009), severity 1.0.
const SIMULATIONS: Record<string, number[][]> = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};

function simulate(c: RGB, matrix: number[][]): RGB {
  const lin = c.map(toLinear);
  return matrix.map((row) =>
    fromLinear(
      Math.min(
        1,
        Math.max(0, row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!),
      ),
    ),
  ) as RGB;
}

function lab(c: RGB): RGB {
  const [r, g, b] = c.map(toLinear) as RGB;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 color difference. */
const deltaE = (a: RGB, b: RGB) =>
  Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]!));

const t = tokens(css);
const TONES = [
  'ring-work',
  'ring-rest',
  'ring-overall',
  'ring-paused',
  'ring-idle',
];

describe('palette contrast against --bg', () => {
  test.each([...TONES, 'text', 'text-muted', 'error', 'focus'])(
    '--%s text reaches 4.5:1',
    (name) => {
      expect(contrast(t[name]!, t.bg!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // Cards and panels, and the selected mode card.
  test.each(
    ['surface', 'surface-strong'].flatMap((bg) =>
      ['text', 'text-muted', 'error'].map((name) => [name, bg]),
    ),
  )('--%s on --%s reaches 4.5:1', (name, bg) => {
    expect(contrast(t[name]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(TONES)('--%s ring fill reaches 3:1', (name) => {
    expect(contrast(t[name]!, t.bg!)).toBeGreaterThanOrEqual(3);
  });

  test.each(['ring-work', 'ring-paused'])(
    '--bg text on a --%s button reaches 4.5:1',
    (name) => {
      expect(contrast(t.bg!, t[name]!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('the input border reaches 3:1', () => {
    expect(contrast(t.border!, t.bg!)).toBeGreaterThanOrEqual(3);
  });
});

describe('main ring tones stay distinguishable', () => {
  const MAIN = ['ring-work', 'ring-rest', 'ring-paused', 'ring-idle'];
  const pairs = MAIN.flatMap((a, i) =>
    MAIN.slice(i + 1).map((b) => [a, b] as const),
  );
  // Shown together while paused: red main ring inside the orange overall ring.
  pairs.push(['ring-paused', 'ring-overall']);

  test.each(
    ['none', ...Object.keys(SIMULATIONS)].flatMap((sim) =>
      pairs.map(([a, b]) => [sim, a, b]),
    ),
  )('%s: --%s vs --%s differ by ΔE ≥ 20', (sim, a, b) => {
    const see = (c: string) =>
      sim === 'none' ? rgb(c) : simulate(rgb(c), SIMULATIONS[sim]!);
    expect(deltaE(see(t[a]!), see(t[b]!))).toBeGreaterThanOrEqual(20);
  });
});
