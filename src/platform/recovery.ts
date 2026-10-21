import type { Clock } from '../core/clock';
import { Runner } from '../core/runner';
import type { CommonConfig, ModeConfig, ModeId, Program } from '../core/types';
import { getMode, isModeId } from '../modes/index';
import {
  keys,
  readJson,
  remove,
  sanitize,
  sanitizeCommon,
  writeJson,
  type KeyValueStore,
} from './storage';

export const RECOVERY_VERSION = 1;
/** A finite run is discarded this long past its expected finish. */
export const STALE_AFTER_FINISH_MS = 60 * 60_000;
/** An uncapped For Time run is discarded this long after its start. */
export const STALE_OPEN_ENDED_MS = 6 * 60 * 60_000;

export interface ActiveRun {
  version: typeof RECOVERY_VERSION;
  modeId: ModeId;
  config: ModeConfig;
  common: CommonConfig;
  state: 'running' | 'paused';
  startedAtWall: number;
  pausedAtWall?: number;
  pausedTotalMs: number;
}

export interface RunMeta {
  modeId: ModeId;
  config: ModeConfig;
  common: CommonConfig;
}

export interface Recovered extends RunMeta {
  program: Program;
  runner: Runner;
}

/** Writes `activeRun` on transitions into or within running/paused only. */
export function attachPersistence(
  runner: Runner,
  store: KeyValueStore,
  meta: RunMeta,
): () => void {
  return runner.on(() => {
    const timing = runner.wallTiming();
    if (!timing) {
      remove(store, keys.activeRun);
      return;
    }
    const run: ActiveRun = { version: RECOVERY_VERSION, ...meta, ...timing };
    writeJson(store, keys.activeRun, run);
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parse(raw: unknown): ActiveRun | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== RECOVERY_VERSION) return null;
  if (!isModeId(r.modeId)) return null;
  if (r.state !== 'running' && r.state !== 'paused') return null;
  if (!isFiniteNumber(r.startedAtWall) || !isFiniteNumber(r.pausedTotalMs))
    return null;
  if (r.state === 'paused' && !isFiniteNumber(r.pausedAtWall)) return null;
  const mode = getMode(r.modeId);
  return {
    version: RECOVERY_VERSION,
    modeId: r.modeId,
    config: sanitize(mode.fields, mode.defaults, r.config),
    common: sanitizeCommon(r.common),
    state: r.state,
    startedAtWall: r.startedAtWall,
    ...(r.state === 'paused' ? { pausedAtWall: r.pausedAtWall as number } : {}),
    pausedTotalMs: r.pausedTotalMs,
  };
}

/**
 * Rebuilds a run interrupted by a reload, or returns null. Corrupt, old,
 * and stale records are discarded.
 */
export function recover(store: KeyValueStore, clock: Clock): Recovered | null {
  const run = parse(readJson(store, keys.activeRun));
  if (!run) {
    remove(store, keys.activeRun);
    return null;
  }
  const mode = getMode(run.modeId);
  if (mode.validate(run.config).length > 0) {
    remove(store, keys.activeRun);
    return null;
  }
  const program = mode.build(run.config, run.common);
  const wallNow = clock.wallNow();
  const stale = Number.isFinite(program.totalMs)
    ? wallNow - (run.startedAtWall + run.pausedTotalMs + program.totalMs) >
      STALE_AFTER_FINISH_MS
    : wallNow - run.startedAtWall > STALE_OPEN_ENDED_MS;
  if (stale) {
    remove(store, keys.activeRun);
    return null;
  }
  const until = run.state === 'paused' ? run.pausedAtWall! : wallNow;
  const elapsedMs = until - run.startedAtWall - run.pausedTotalMs;
  const runner = Runner.restore(program, clock, { ...run, elapsedMs });
  if (runner.state === 'finished') remove(store, keys.activeRun);
  return {
    modeId: run.modeId,
    config: run.config,
    common: run.common,
    program,
    runner,
  };
}
