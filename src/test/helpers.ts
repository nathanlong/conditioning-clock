import { format } from '../core/format';
import type { CommonConfig, ModeId, Program } from '../core/types';
import { COMMON_DEFAULTS } from '../modes/common';
import { modes } from '../modes/index';

export function buildProgram(
  modeId: ModeId,
  overrides: Record<string, number | boolean> = {},
  common: Partial<CommonConfig> = {},
): Program {
  const mode = modes[modeId];
  return mode.build({ ...mode.defaults, ...overrides } as never, {
    ...COMMON_DEFAULTS,
    ...common,
  });
}

function time(ms: number): string {
  if (!Number.isFinite(ms)) return '∞';
  const whole = format(ms / 1000);
  const fraction = ms % 1000;
  return fraction === 0
    ? whole
    : `${whole}.${String(Math.round(fraction)).padStart(3, '0')}`;
}

function duration(ms: number): string {
  return Number.isFinite(ms) ? `${ms / 1000}s` : '∞';
}

/** A compact, human-readable timeline: one segment per line, then the cues. */
export function describeProgram(program: Program): string {
  const segments = program.segments.map((s) => {
    const round = s.round ? ` R${s.round}/${s.totalRounds}` : '';
    const dir = s.direction === 'up' ? ' up' : '';
    return `${time(s.startMs)} ${s.kind}${round} ${duration(s.durationMs)}${dir}`;
  });
  const cues = program.cues.map((c) => `${time(c.atMs)} ${c.sound}`);
  return [...segments, `cues: ${cues.join(', ')}`].join('\n');
}
