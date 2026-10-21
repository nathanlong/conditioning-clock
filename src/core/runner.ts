import type { Clock } from './clock';
import type { Program, RunState } from './types';

type Listener = (state: RunState, prev: RunState) => void;

/** The wall-clock half of the runner's timing, for persistence. */
export interface WallTiming {
  state: 'running' | 'paused';
  startedAtWall: number;
  pausedAtWall?: number;
  pausedTotalMs: number;
}

export interface RestoreOptions extends WallTiming {
  elapsedMs: number;
}

/**
 * The clock + state machine. Elapsed time is always derived from the clock,
 * never accumulated. No DOM, no rAF.
 */
export class Runner {
  #state: RunState = 'idle';
  #listeners = new Set<Listener>();
  #timer: number | null = null;
  // Monotonic time, for in-session timing.
  #startedAt = 0;
  #pausedAt = 0;
  #pausedTotal = 0;
  // Wall time, for persistence and recovery.
  #startedAtWall = 0;
  #pausedAtWall = 0;
  #pausedTotalWall = 0;
  #finalElapsed = 0;

  constructor(
    readonly program: Program,
    private readonly clock: Clock,
  ) {}

  /** Rebuilds a runner at a known position after a reload. */
  static restore(
    program: Program,
    clock: Clock,
    options: RestoreOptions,
  ): Runner {
    const runner = new Runner(program, clock);
    const elapsed = Math.max(0, options.elapsedMs);
    runner.#startedAtWall = options.startedAtWall;
    runner.#pausedTotalWall = options.pausedTotalMs;
    if (elapsed >= program.totalMs) {
      runner.#state = 'finished';
      runner.#finalElapsed = program.totalMs;
      return runner;
    }
    runner.#startedAt = clock.now() - elapsed;
    if (options.state === 'paused') {
      runner.#state = 'paused';
      runner.#pausedAt = clock.now();
      runner.#pausedAtWall = options.pausedAtWall ?? clock.wallNow();
    } else {
      runner.#state = 'running';
      runner.#armFinish();
    }
    return runner;
  }

  get state(): RunState {
    return this.#state;
  }

  on(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  elapsedMs(): number {
    switch (this.#state) {
      case 'idle':
        return 0;
      case 'finished':
        return this.#finalElapsed;
      case 'paused':
        return this.#pausedAt - this.#startedAt - this.#pausedTotal;
      case 'running': {
        const elapsed = this.clock.now() - this.#startedAt - this.#pausedTotal;
        if (elapsed >= this.program.totalMs) {
          this.#finish(this.program.totalMs);
          return this.#finalElapsed;
        }
        return elapsed;
      }
    }
  }

  start(): boolean {
    if (this.#state !== 'idle') return false;
    this.#startedAt = this.clock.now();
    this.#startedAtWall = this.clock.wallNow();
    this.#pausedTotal = 0;
    this.#pausedTotalWall = 0;
    this.#set('running');
    this.#armFinish();
    // A zero-length program would finish immediately.
    this.elapsedMs();
    return true;
  }

  pause(): boolean {
    if (this.#state !== 'running') return false;
    // Reading first lets a due finish win over the pause.
    this.elapsedMs();
    if (this.#state !== 'running') return false;
    this.#pausedAt = this.clock.now();
    this.#pausedAtWall = this.clock.wallNow();
    this.#disarm();
    this.#set('paused');
    return true;
  }

  resume(): boolean {
    if (this.#state !== 'paused') return false;
    this.#pausedTotal += this.clock.now() - this.#pausedAt;
    this.#pausedTotalWall += this.clock.wallNow() - this.#pausedAtWall;
    this.#set('running');
    this.#armFinish();
    return true;
  }

  /** Ends the run early, freezing elapsed time (For Time's Done). */
  done(): boolean {
    if (this.#state !== 'running' && this.#state !== 'paused') return false;
    const elapsed = this.elapsedMs();
    if ((this.#state as RunState) === 'finished') return true;
    this.#finish(elapsed);
    return true;
  }

  reset(): boolean {
    if (this.#state === 'idle') return false;
    this.#disarm();
    this.#finalElapsed = 0;
    this.#set('idle');
    return true;
  }

  /** The persisted timing while running or paused; null otherwise. */
  wallTiming(): WallTiming | null {
    if (this.#state !== 'running' && this.#state !== 'paused') return null;
    return {
      state: this.#state,
      startedAtWall: this.#startedAtWall,
      ...(this.#state === 'paused' ? { pausedAtWall: this.#pausedAtWall } : {}),
      pausedTotalMs: this.#pausedTotalWall,
    };
  }

  #finish(elapsed: number): void {
    this.#disarm();
    this.#finalElapsed = Math.min(elapsed, this.program.totalMs);
    this.#set('finished');
  }

  /** Finish detection that doesn't depend on anyone reading elapsed time. */
  #armFinish(): void {
    this.#disarm();
    const remaining = this.program.totalMs - this.#elapsedUnchecked();
    if (!Number.isFinite(remaining)) return;
    this.#timer = this.clock.setTimeout(
      () => {
        this.#timer = null;
        if (this.#state !== 'running') return;
        this.elapsedMs();
        // A timer that fires a hair early re-arms for the rest.
        if (this.#state === 'running') this.#armFinish();
      },
      Math.max(0, remaining),
    );
  }

  #elapsedUnchecked(): number {
    return this.clock.now() - this.#startedAt - this.#pausedTotal;
  }

  #disarm(): void {
    if (this.#timer !== null) this.clock.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #set(state: RunState): void {
    const prev = this.#state;
    if (prev === state) return;
    this.#state = state;
    for (const listener of [...this.#listeners]) listener(state, prev);
  }
}
