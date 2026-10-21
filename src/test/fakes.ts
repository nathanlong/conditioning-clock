import type { Clock } from '../core/clock';
import type { SoundId } from '../core/types';
import type { AudioEngine } from '../audio/context';
import type { AudioPort } from '../audio/scheduler';
import type { KeyValueStore } from '../platform/storage';
import type { WakeLockHandle, WakeLockPort } from '../platform/wakeLock';

interface Timer {
  id: number;
  at: number;
  seq: number;
  fn: () => void;
}

/**
 * Controls both time and timeouts. `advance` moves the monotonic and wall
 * clocks together and fires due timeouts in order; `jump` moves only wall
 * time, to simulate a reload gap.
 */
export class FakeClock implements Clock {
  mono = 1000;
  wall = Date.UTC(2026, 0, 1, 12);
  #timers: Timer[] = [];
  #nextId = 1;

  now(): number {
    return this.mono;
  }

  wallNow(): number {
    return this.wall;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.#nextId++;
    this.#timers.push({ id, at: this.mono + Math.max(0, ms), seq: id, fn });
    return id;
  }

  clearTimeout(id: number): void {
    this.#timers = this.#timers.filter((t) => t.id !== id);
  }

  advance(ms: number): void {
    const target = this.mono + ms;
    for (;;) {
      const due = this.#timers
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.clearTimeout(due.id);
      this.#moveTo(due.at);
      due.fn();
    }
    this.#moveTo(target);
  }

  jump(ms: number): void {
    this.wall += ms;
  }

  get pendingTimers(): number {
    return this.#timers.length;
  }

  #moveTo(mono: number): void {
    this.wall += mono - this.mono;
    this.mono = mono;
  }
}

export interface PlayedSound {
  sound: SoundId;
  at: number;
  stopped: boolean;
}

/**
 * Records what was scheduled. Linked to a FakeClock, its audio clock moves
 * with it; `time` is the audio time when linked (or set directly).
 */
export class FakeAudioPort implements AudioPort {
  time = 0;
  played: PlayedSound[] = [];
  readonly #clock: FakeClock | undefined;
  readonly #linkedAt: number;

  constructor(clock?: FakeClock) {
    this.#clock = clock;
    this.#linkedAt = clock?.now() ?? 0;
  }

  currentTime(): number {
    const moved = this.#clock ? (this.#clock.now() - this.#linkedAt) / 1000 : 0;
    return this.time + moved;
  }

  play(sound: SoundId, at: number): { stop(): void } {
    const entry: PlayedSound = { sound, at, stopped: false };
    this.played.push(entry);
    return {
      stop: () => {
        entry.stopped = true;
      },
    };
  }

  /** Sounds that were scheduled and not stopped. */
  get audible(): PlayedSound[] {
    return this.played.filter((p) => !p.stopped);
  }
}

/** A requestAnimationFrame stand-in where `flush()` renders one frame. */
export class ManualFrames {
  #queue = new Map<number, FrameRequestCallback>();
  #nextId = 1;

  request = (cb: FrameRequestCallback): number => {
    const id = this.#nextId++;
    this.#queue.set(id, cb);
    return id;
  };

  cancel = (id: number): void => {
    this.#queue.delete(id);
  };

  flush(time = 0): void {
    const callbacks = [...this.#queue.values()];
    this.#queue.clear();
    for (const cb of callbacks) cb(time);
  }

  get pending(): number {
    return this.#queue.size;
  }
}

export class MemoryStorage implements KeyValueStore {
  data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** Safari private mode, or a full quota. */
export class ThrowingStorage implements KeyValueStore {
  getItem(): string | null {
    throw new DOMException('denied', 'SecurityError');
  }

  setItem(): void {
    throw new DOMException('full', 'QuotaExceededError');
  }

  removeItem(): void {
    throw new DOMException('denied', 'SecurityError');
  }
}

export class FakeWakeLock implements WakeLockPort {
  calls: ('request' | 'release')[] = [];
  reject = false;
  handles: (WakeLockHandle & { released: boolean })[] = [];

  async request(): Promise<WakeLockHandle> {
    this.calls.push('request');
    if (this.reject) throw new DOMException('denied', 'NotAllowedError');
    const handle = {
      released: false,
      release: async () => {
        if (handle.released) return;
        handle.released = true;
        this.calls.push('release');
      },
    };
    this.handles.push(handle);
    return handle;
  }

  /** What the browser does when the page is hidden. */
  systemRelease(): void {
    for (const h of this.handles) h.released = true;
  }

  get held(): boolean {
    return this.handles.some((h) => !h.released);
  }
}

/** An AudioEngine whose port is a FakeAudioPort, available once unlocked. */
export class FakeAudioEngine implements AudioEngine {
  unlocks = 0;
  level = { volume: 1, muted: false };
  readonly audioPort: FakeAudioPort;
  #listeners = new Set<(state: string) => void>();

  constructor(clock?: FakeClock) {
    this.audioPort = new FakeAudioPort(clock);
  }

  unlock(): void {
    this.unlocks++;
  }

  port(): AudioPort | null {
    return this.unlocks > 0 ? this.audioPort : null;
  }

  setVolume(volume: number, muted: boolean): void {
    this.level = { volume, muted };
  }

  onStateChange(listener: (state: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(state: string): void {
    for (const listener of this.#listeners) listener(state);
  }
}
