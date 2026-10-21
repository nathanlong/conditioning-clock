import type { AudioPort } from './scheduler';
import { createWebAudioPort } from './sounds';

/** What the app needs from audio; faked in browser tests. */
export interface AudioEngine {
  /** Creates and resumes the context. Call inside a user gesture. */
  unlock(): void;
  /** Null until unlocked, or where Web Audio is unsupported. */
  port(): AudioPort | null;
  setVolume(volume: number, muted: boolean): void;
  /** Fires with the context state: 'running', 'suspended', 'interrupted'… */
  onStateChange(listener: (state: string) => void): () => void;
}

interface AudioSessionNavigator {
  audioSession?: { type: string };
}

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let port: AudioPort | null = null;
  let level = { volume: 1, muted: false };
  const listeners = new Set<(state: string) => void>();

  const apply = () => {
    if (master) master.gain.value = level.muted ? 0 : level.volume;
  };

  return {
    unlock() {
      if (!ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        // iOS: play through the hardware silent switch.
        const session = (navigator as AudioSessionNavigator).audioSession;
        if (session) session.type = 'playback';
        ctx = new Ctor();
        master = ctx.createGain();
        master.connect(ctx.destination);
        apply();
        port = createWebAudioPort(ctx, master);
        const context = ctx;
        context.onstatechange = () => {
          for (const listener of listeners) listener(context.state);
        };
      }
      void ctx.resume().catch(() => {});
    },
    port: () => port,
    setVolume(volume, muted) {
      level = { volume, muted };
      apply();
    },
    onStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
