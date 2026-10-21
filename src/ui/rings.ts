import type { Program } from '../core/types';
import { svg } from './h';
import type { Ring, RingState } from './ringState';

const SIZE = 200;
const C = SIZE / 2;
const MAIN_R = 78;
const OVERALL_R = 94;

/** Inner and outer radius of the tick marks on each ring's outer edge. */
const TICK_SPAN = {
  main: [MAIN_R + 2, MAIN_R + 14],
  overall: [OVERALL_R - 4, OVERALL_R + 6],
} as const;

/** Short radial lines at each fraction of the circle (0 = 12 o'clock). */
function ticks({ ring, at }: NonNullable<Program['display']['ticks']>) {
  const [inner, outer] = TICK_SPAN[ring];
  return svg(
    'g',
    { class: `ticks ${ring}` },
    ...at.map((fraction) => {
      const angle = fraction * 2 * Math.PI;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      return svg('line', {
        x1: C + inner * cos,
        y1: C + inner * sin,
        x2: C + outer * cos,
        y2: C + outer * sin,
      });
    }),
  );
}

/** Where on a ring `progress` really is, past the round cap's overhang. */
export function headPosition(progress: number, r: number) {
  const angle = progress * 2 * Math.PI;
  return { cx: C + r * Math.cos(angle), cy: C + r * Math.sin(angle) };
}

function ring(className: string, r: number, headR: number) {
  const attrs = { cx: C, cy: C, r, pathLength: 1 };
  const track = svg('circle', { ...attrs, class: `track ${className}` });
  const fill = svg('circle', {
    ...attrs,
    class: `fill ${className}`,
    'stroke-dasharray': '1 1',
  });
  // The fill's round cap overhangs its true end by half a stroke; this marks
  // the end itself.
  const head = svg('circle', { class: 'head', r: headR });
  const group = svg('g', { class: `ring ${className}` }, track, fill, head);
  let last = { progress: -1, tone: '' };
  return {
    group,
    fill,
    set({ progress, tone }: Ring) {
      if (progress !== last.progress) {
        fill.setAttribute('stroke-dashoffset', String(1 - progress));
        // A zero-length dash still draws a round cap.
        fill.style.visibility = progress <= 0 ? 'hidden' : '';
        // A full ring has no end to mark.
        head.style.visibility = progress <= 0 || progress >= 1 ? 'hidden' : '';
        const { cx, cy } = headPosition(progress, r);
        head.setAttribute('cx', String(cx));
        head.setAttribute('cy', String(cy));
      }
      if (tone !== last.tone) group.setAttribute('data-tone', tone);
      last = { progress, tone };
    },
  };
}

export interface Rings {
  el: SVGSVGElement;
  main: SVGGElement;
  set(state: RingState): void;
}

/** One inline SVG: a thick main ring inside a thinner overall ring. */
export function createRings(
  withOverall: boolean,
  tickMarks?: Program['display']['ticks'],
): Rings {
  const main = ring('main', MAIN_R, 2.5);
  const overall = withOverall ? ring('overall', OVERALL_R, 1.25) : null;
  const el = svg(
    'svg',
    {
      class: 'rings',
      viewBox: `0 0 ${SIZE} ${SIZE}`,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    svg(
      'g',
      { transform: `rotate(-90 ${C} ${C})` },
      overall?.group,
      main.group,
      tickMarks ? ticks(tickMarks) : null,
    ),
  );
  return {
    el,
    main: main.group,
    set(state) {
      main.set(state.main);
      if (overall && state.overall) overall.set(state.overall);
    },
  };
}
