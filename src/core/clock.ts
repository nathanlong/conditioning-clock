export interface Clock {
  /** Monotonic ms (performance.now) for in-session timing. */
  now(): number;
  /** Date.now(), used only for persistence and recovery. */
  wallNow(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export const browserClock: Clock = {
  now: () => performance.now(),
  wallNow: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};
