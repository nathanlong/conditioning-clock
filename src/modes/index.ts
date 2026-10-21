import type { ModeDefinition, ModeId } from '../core/types';
import { amrap } from './amrap';
import { emom } from './emom';
import { etot } from './etot';
import { forTime } from './forTime';
import { tabata } from './tabata';

export const modes = {
  emom,
  etot,
  amrap,
  forTime,
  tabata,
} satisfies Record<ModeId, ModeDefinition<any>>;

/** In picker order. */
export const modeList: ModeDefinition<any>[] = Object.values(modes);

export function isModeId(value: unknown): value is ModeId {
  return typeof value === 'string' && Object.hasOwn(modes, value);
}

export function getMode(id: ModeId): ModeDefinition<any> {
  return modes[id];
}
