import type { Clock } from '../core/clock';
import type { Runner } from '../core/runner';
import type { Program, SoundId } from '../core/types';

export interface AudioPort {
  /** Seconds, on the AudioContext clock. */
  currentTime(): number;
  play(sound: SoundId, at: number): { stop(): void };
}

export interface SchedulerOptions {
  windowMs?: number;
  intervalMs?: number;
}

/**
 * Schedules cues ahead on the audio clock ("A Tale of Two Clocks"), so they
 * play on time even when the display loop stalls.
 */
export class AudioScheduler {
  #scheduled = new Map<number, { stop(): void }>();
  #timer: number | null = null;
  #hidden = false;
  #unsubscribe: (() => void) | null = null;
  readonly #windowMs: number;
  readonly #intervalMs: number;

  constructor(
    private readonly program: Program,
    private readonly runner: Runner,
    private readonly port: AudioPort,
    private readonly clock: Clock,
    { windowMs = 5000, intervalMs = 250 }: SchedulerOptions = {},
  ) {
    this.#windowMs = windowMs;
    this.#intervalMs = intervalMs;
  }

  attach(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.runner.on(() => this.#sync());
    this.#sync();
  }

  detach(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#stopLoop();
    this.#stopAll();
  }

  /**
   * Hidden tabs throttle timers, so everything left in the program is
   * scheduled at once.
   */
  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    if (hidden) this.pass();
  }

  /** Drops everything scheduled and starts again from the current position. */
  resync(): void {
    this.#stopAll();
    this.pass();
  }

  pass(): void {
    if (this.runner.state !== 'running') return;
    const elapsed = this.runner.elapsedMs();
    // Reading elapsed time can finish the run.
    if (this.runner.state !== 'running') return;
    const horizon = this.#hidden ? Infinity : elapsed + this.#windowMs;
    const now = this.port.currentTime();
    this.program.cues.forEach((cue, i) => {
      if (cue.atMs < elapsed || cue.atMs > horizon || this.#scheduled.has(i))
        return;
      const at = now + (cue.atMs - elapsed) / 1000;
      this.#scheduled.set(i, this.port.play(cue.sound, at));
    });
  }

  #sync(): void {
    switch (this.runner.state) {
      case 'running':
        this.#startLoop();
        this.pass();
        break;
      case 'finished': {
        // Let the finish sound ring out, but silence anything after a Done.
        this.#stopLoop();
        const final = this.runner.elapsedMs();
        for (const [i, handle] of this.#scheduled) {
          if (this.program.cues[i]!.atMs > final) handle.stop();
        }
        this.#scheduled.clear();
        break;
      }
      default:
        this.#stopLoop();
        this.#stopAll();
    }
  }

  #startLoop(): void {
    if (this.#timer !== null) return;
    const tick = () => {
      this.#timer = this.clock.setTimeout(tick, this.#intervalMs);
      this.pass();
    };
    this.#timer = this.clock.setTimeout(tick, this.#intervalMs);
  }

  #stopLoop(): void {
    if (this.#timer !== null) this.clock.clearTimeout(this.#timer);
    this.#timer = null;
  }

  #stopAll(): void {
    for (const handle of this.#scheduled.values()) handle.stop();
    this.#scheduled.clear();
  }
}
