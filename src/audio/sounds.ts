import type { SoundId } from '../core/types';
import type { AudioPort } from './scheduler';

// Synthesis ideas from Cuelume (MIT, github.com/danielwh2/cuelume): struck
// sines with inharmonic modes, a noise "contact" transient, exponential decay,
// a faint room, and a soft clip that catches overlapping peaks.

interface BaseLayer {
  /** Seconds after the cue time. */
  offset: number;
  /** Seconds to rise to the peak. Kept ≤ 3ms so cues land on the beat. */
  attack: number;
  /** Seconds to fall 60dB after the attack. */
  decay: number;
  /** Peak gain, before the output stage and the master volume. */
  peak: number;
}

/** A sine: one mode of a struck object. */
export interface ToneLayer extends BaseLayer {
  kind: 'tone';
  frequency: number;
}

/** Low-passed noise: the mallet meeting the bar. */
export interface NoiseLayer extends BaseLayer {
  kind: 'noise';
  /** Lowpass cutoff: the mallet's hardness. */
  hardness: number;
}

export type Layer = ToneLayer | NoiseLayer;

/** A struck object's modes as [ratio to the fundamental, level]. */
type Material = readonly (readonly [ratio: number, level: number])[];

/** A free bar, glass or metal: inharmonic, so it reads as an object. */
const BAR: Material = [
  [1, 1],
  [2.76, 0.3],
  [5.4, 0.1],
];
/** A marimba bar, its second mode undercut to 3.99x, plus the octave that carries a low note on small speakers. */
const MALLET: Material = [
  [1, 1],
  [2, 0.5],
  [3.99, 0.2],
];

/** Modes above this are left out: harsh, and phones play them poorly. */
const MODE_CEILING = 6000;
/** Long enough not to click, short enough to strike. */
const STRIKE_ATTACK = 0.003;

/** A struck note: one sine per mode, higher modes dying sooner. */
function struck(
  frequency: number,
  decay: number,
  peak: number,
  material: Material,
  offset = 0,
): ToneLayer[] {
  return material
    .filter(([ratio]) => frequency * ratio <= MODE_CEILING)
    .map(([ratio, level]) => ({
      kind: 'tone',
      offset,
      frequency: frequency * ratio,
      attack: STRIKE_ATTACK,
      decay: Math.max(0.03, decay / ratio ** 0.75),
      peak: peak * level,
    }));
}

/** A twin a hertz or two sharp, so a long note shimmers once as it rings. */
function twin(frequency: number, decay: number, peak: number, offset = 0) {
  return struck(frequency + 1.5, decay, peak, [[1, 1]], offset);
}

/** The 3ms tap that marks the exact moment of a cue and cuts through noise. */
function contact(hardness: number, peak: number, offset = 0): NoiseLayer {
  return {
    kind: 'noise',
    offset,
    hardness,
    attack: 0.001,
    decay: 0.012,
    peak,
  };
}

// Pitches stay in the 500–1400Hz range, which carries well on phone speakers
// and avoids the very high frequencies that age-related hearing loss affects.
export const SOUNDS: Record<SoundId, Layer[]> = {
  /** A glass tap. */
  tick: [contact(3000, 0.12), ...struck(880, 0.6, 0.62, BAR)],
  /** A bright bell that rings on. */
  go: [
    contact(3500, 0.12),
    ...struck(1318.5, 1.4, 0.42, BAR),
    ...twin(1318.5, 1.3, 0.16),
    ...struck(659.25, 1.0, 0.17, MALLET),
  ],
  /** Two lower wooden strikes. */
  rest: [
    contact(1800, 0.12),
    ...struck(523.25, 0.6, 0.64, MALLET),
    contact(1800, 0.12, 0.25),
    ...struck(523.25, 0.6, 0.64, MALLET, 0.25),
  ],
  /** A quick rising run on wood: unmissable, and never mistaken for the glass tick. */
  pace: [
    contact(2000, 0.12),
    ...struck(783.99, 0.55, 0.55, MALLET),
    contact(2000, 0.12, 0.11),
    ...struck(1046.5, 0.55, 0.55, MALLET, 0.11),
    contact(2200, 0.12, 0.22),
    ...struck(1318.5, 0.8, 0.55, MALLET, 0.22),
  ],
  /** C–E–G rising, then a high C that rings longest. */
  finish: [
    contact(2500, 0.1),
    ...struck(523.25, 0.6, 0.4, MALLET),
    contact(2500, 0.1, 0.18),
    ...struck(659.25, 0.6, 0.4, MALLET, 0.18),
    contact(3000, 0.1, 0.36),
    ...struck(783.99, 0.7, 0.4, MALLET, 0.36),
    contact(3500, 0.12, 0.54),
    ...struck(1046.5, 1.6, 0.5, BAR, 0.54),
    ...twin(1046.5, 1.5, 0.18, 0.54),
  ],
};

/**
 * Gain into the soft clip. Each sound peaks at or under the knee on its own,
 * so the clip only rounds off overlaps (a go landing on a tick's ring). The
 * WaveShaper hard-clips anything past ±1, so never drive it there.
 */
export const OUTPUT_GAIN = 1;
/** Below this the clip is linear; above it, peaks round off instead of cracking. */
const CLIP_KNEE = 0.8;
/** Nothing below this is heard on a phone, but it would spend headroom. */
const SUBSONIC_HZ = 60;

/** The room: a quarter second of reflections, about 20dB down. */
const ROOM_SECONDS = 0.25;
const ROOM_PREDELAY = 0.008;
const ROOM_LOWPASS = 3500;
const ROOM_SEND = 0.1;

/** How long a stopped sound takes to fade: heard as instant, but no click. */
const STOP_FADE = 0.015;
/** Source nodes run this long past their decay. */
const STOP_PADDING = 0.05;

/** Deterministic noise, so every play (and every test render) is identical. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function softClip(x: number): number {
  const over = Math.abs(x) - CLIP_KNEE;
  if (over <= 0) return x;
  const shoulder = 1 - CLIP_KNEE;
  return Math.sign(x) * (CLIP_KNEE + over - (over * over) / (2 * shoulder));
}

interface Bus {
  /** Every sound connects here. */
  input: GainNode;
  /** Sends to the room connect here. */
  room: AudioNode;
  noise: AudioBuffer;
}

/** gain → subsonic cut → soft clip → destination, with the room feeding the gain. */
function createBus(
  ctx: BaseAudioContext,
  destination: AudioNode,
  outputGain: number,
): Bus {
  const input = ctx.createGain();
  input.gain.value = outputGain;
  const subsonic = ctx.createBiquadFilter();
  subsonic.type = 'highpass';
  subsonic.frequency.value = SUBSONIC_HZ;
  const clip = ctx.createWaveShaper();
  clip.curve = Float32Array.from({ length: 1025 }, (_, i) =>
    softClip((2 * i) / 1024 - 1),
  );
  input.connect(subsonic).connect(clip).connect(destination);

  const rate = ctx.sampleRate;
  const impulse = ctx.createBuffer(2, Math.floor(ROOM_SECONDS * rate), rate);
  const fall = 3 * Math.LN10; // 60dB over ROOM_SECONDS
  [3110, 5639].forEach((seed, channel) => {
    const random = seeded(seed);
    const data = impulse.getChannelData(channel);
    let energy = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      data[i] =
        t < ROOM_PREDELAY
          ? 0
          : (2 * random() - 1) * Math.exp((-fall * t) / ROOM_SECONDS);
      energy += data[i]! * data[i]!;
    }
    const scale = 1 / Math.sqrt(energy);
    for (let i = 0; i < data.length; i++) data[i]! *= scale;
  });
  const walls = ctx.createBiquadFilter();
  walls.type = 'lowpass';
  walls.frequency.value = ROOM_LOWPASS;
  const convolver = ctx.createConvolver();
  convolver.normalize = false;
  convolver.buffer = impulse;
  walls.connect(convolver).connect(input);

  const noise = ctx.createBuffer(1, rate, rate);
  const random = seeded(1);
  noise.getChannelData(0).forEach((_, i, data) => {
    data[i] = 2 * random() - 1;
  });

  return { input, room: walls, noise };
}

/** Rises along a straight line, then dies away exponentially. */
function envelope(param: AudioParam, layer: Layer, t0: number) {
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(layer.peak, t0 + layer.attack);
  param.setTargetAtTime(0, t0 + layer.attack, layer.decay / (3 * Math.LN10));
}

/** An AudioPort that synthesizes each sound as struck objects in a small room. */
export function createWebAudioPort(
  ctx: BaseAudioContext,
  destination: AudioNode,
  /** Tests turn this down to render a sound without the clip. */
  { outputGain = OUTPUT_GAIN }: { outputGain?: number } = {},
): AudioPort {
  let bus: Bus | null = null;
  return {
    currentTime: () => ctx.currentTime,
    play(sound, at) {
      bus ??= createBus(ctx, destination, outputGain);
      const start = Math.max(at, ctx.currentTime);
      // One gain per play, so stop() can fade it rather than click.
      const voice = ctx.createGain();
      const send = ctx.createGain();
      send.gain.value = ROOM_SEND;
      voice.connect(bus.input);
      voice.connect(send).connect(bus.room);

      let end = start;
      const sources = SOUNDS[sound].map((layer) => {
        const t0 = start + layer.offset;
        const t1 = t0 + layer.attack + layer.decay + STOP_PADDING;
        end = Math.max(end, t1);
        const env = ctx.createGain();
        envelope(env.gain, layer, t0);
        let source: AudioScheduledSourceNode;
        if (layer.kind === 'tone') {
          const osc = ctx.createOscillator();
          osc.frequency.value = layer.frequency;
          osc.connect(env);
          source = osc;
        } else {
          const noise = ctx.createBufferSource();
          noise.buffer = bus!.noise;
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = layer.hardness;
          noise.connect(filter).connect(env);
          source = noise;
        }
        env.connect(voice);
        source.start(t0);
        source.stop(t1);
        return source;
      });
      // Disconnect after the longest-ringing layer, not the last listed.
      const longest =
        sources[
          SOUNDS[sound].reduce(
            (best, layer, i, layers) =>
              layer.offset + layer.decay >
              layers[best]!.offset + layers[best]!.decay
                ? i
                : best,
            0,
          )
        ]!;
      longest.onended = () => {
        voice.disconnect();
        send.disconnect();
      };

      return {
        stop() {
          const now = ctx.currentTime;
          voice.gain.cancelScheduledValues(now);
          voice.gain.setValueAtTime(voice.gain.value, now);
          voice.gain.linearRampToValueAtTime(0, now + STOP_FADE);
          for (const source of sources) {
            try {
              source.stop(Math.min(end, now + STOP_FADE));
            } catch {
              // Already stopped.
            }
          }
        },
      };
    },
  };
}
