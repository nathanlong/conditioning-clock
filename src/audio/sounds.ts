import type { SoundId } from '../core/types';
import type { AudioPort } from './scheduler';

interface Tone {
  /** Seconds after the cue time. */
  offset: number;
  frequency: number;
  duration: number;
  type: OscillatorType;
  /** Peak gain, before the master volume. */
  gain: number;
}

// Square and triangle waves cut through gym noise. Pitches stay in the
// 500–1400Hz range, which carries well and avoids the highest frequencies.
export const SOUNDS: Record<SoundId, Tone[]> = {
  tick: [
    { offset: 0, frequency: 880, duration: 0.12, type: 'square', gain: 0.5 },
  ],
  go: [
    { offset: 0, frequency: 1320, duration: 0.6, type: 'square', gain: 0.6 },
  ],
  rest: [
    { offset: 0, frequency: 520, duration: 0.15, type: 'square', gain: 0.6 },
    { offset: 0.25, frequency: 520, duration: 0.15, type: 'square', gain: 0.6 },
  ],
  pace: [
    {
      offset: 0,
      frequency: 1000,
      duration: 0.08,
      type: 'triangle',
      gain: 0.45,
    },
  ],
  finish: [
    { offset: 0, frequency: 660, duration: 0.2, type: 'square', gain: 0.6 },
    { offset: 0.22, frequency: 880, duration: 0.2, type: 'square', gain: 0.6 },
    {
      offset: 0.44,
      frequency: 1320,
      duration: 0.45,
      type: 'square',
      gain: 0.6,
    },
  ],
};

const ATTACK = 0.005;
const RELEASE = 0.03;

/** An AudioPort that synthesizes each sound with oscillators. */
export function createWebAudioPort(
  ctx: BaseAudioContext,
  destination: AudioNode,
): AudioPort {
  return {
    currentTime: () => ctx.currentTime,
    play(sound, at) {
      const start = Math.max(at, ctx.currentTime);
      const nodes = SOUNDS[sound].map((tone) => {
        const t0 = start + tone.offset;
        const t1 = t0 + tone.duration;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = tone.type;
        osc.frequency.value = tone.frequency;
        // Fast attack and a short release, so there are no clicks.
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(tone.gain, t0 + ATTACK);
        env.gain.setValueAtTime(tone.gain, t1 - RELEASE);
        env.gain.linearRampToValueAtTime(0, t1);
        osc.connect(env).connect(destination);
        osc.start(t0);
        osc.stop(t1 + 0.01);
        osc.onended = () => env.disconnect();
        return osc;
      });
      return {
        stop() {
          for (const osc of nodes) {
            try {
              osc.stop();
            } catch {
              // Already stopped.
            }
          }
        },
      };
    },
  };
}
