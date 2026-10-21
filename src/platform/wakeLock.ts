export interface WakeLockHandle {
  readonly released: boolean;
  release(): Promise<void>;
}

export interface WakeLockPort {
  request(): Promise<WakeLockHandle>;
}

/** The Screen Wake Lock API, or null where unsupported. */
export function browserWakeLock(): WakeLockPort | null {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator))
    return null;
  return { request: () => navigator.wakeLock.request('screen') };
}

/**
 * Holds the lock while wanted. The browser drops it when the page is hidden,
 * so `onVisible` re-requests it. Failures are silent.
 */
export class WakeLockController {
  #handle: WakeLockHandle | null = null;
  #want = false;
  #pending: Promise<void> | null = null;

  constructor(private readonly port: WakeLockPort | null) {}

  set(want: boolean): void {
    this.#want = want;
    if (want) this.#acquire();
    else this.#release();
  }

  onVisible(): void {
    if (this.#want) this.#acquire();
  }

  /** Resolves once any in-flight request settles (for tests). */
  async settled(): Promise<void> {
    await this.#pending;
  }

  #acquire(): void {
    if (!this.port || this.#pending) return;
    if (this.#handle && !this.#handle.released) return;
    this.#pending = this.port
      .request()
      .then((handle) => {
        this.#handle = handle;
        // Wanted no longer by the time it arrived.
        if (!this.#want) this.#release();
      })
      .catch(() => {})
      .finally(() => {
        this.#pending = null;
      });
  }

  #release(): void {
    const handle = this.#handle;
    this.#handle = null;
    if (handle && !handle.released) void handle.release().catch(() => {});
  }
}
