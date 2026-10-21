import { describe, expect, test } from 'vitest';
import type { SoundId } from '../core/types';
import { createWebAudioPort, OUTPUT_GAIN } from './sounds';

const RATE = 48_000;
const SECONDS = 2.5;
/** Phone speakers reproduce little below this, so it doesn't count. */
const SPEAKER_HIGHPASS_HZ = 500;
/** About the ear's integration time for short sounds. */
const WINDOW_SECONDS = 0.1;
/** Above this, energy reads as harsh or buzzy rather than bright. */
const HARSH_HZ = 4000;

/** Renders one sound offline, optionally through a highpass filter. */
async function render(
  sound: SoundId,
  {
    highpass,
    stopAt,
    outputGain,
  }: { highpass?: number; stopAt?: number; outputGain?: number } = {},
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, RATE * SECONDS, RATE);
  let destination: AudioNode = ctx.destination;
  if (highpass) {
    // Two stages, for a steeper cut.
    for (let i = 0; i < 2; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;
      filter.connect(destination);
      destination = filter;
    }
  }
  const playing = createWebAudioPort(
    ctx,
    destination,
    outputGain === undefined ? {} : { outputGain },
  ).play(sound, 0);
  if (stopAt !== undefined)
    void ctx.suspend(stopAt).then(() => {
      playing.stop();
      void ctx.resume();
    });
  return (await ctx.startRendering()).getChannelData(0);
}

const energy = (data: Float32Array, from = 0, to = data.length) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i]! * data[i]!;
  return sum;
};
const dB = (ratio: number) => 10 * Math.log10(ratio);

/**
 * How loud a sound is through a phone speaker: the loudest 100ms of it, as RMS
 * in dBFS, after cutting what a phone can't play.
 */
async function loudness(sound: SoundId): Promise<number> {
  const data = await render(sound, { highpass: SPEAKER_HIGHPASS_HZ });
  const window = Math.round(WINDOW_SECONDS * RATE);
  const hop = Math.round(0.01 * RATE);
  let best = 0;
  for (let start = 0; start + window <= data.length; start += hop)
    best = Math.max(best, energy(data, start, start + window) / window);
  return dB(best);
}

/** The share of a sound's energy in the harsh band, in dB. */
async function harshness(sound: SoundId): Promise<number> {
  const all = await render(sound);
  const high = await render(sound, { highpass: HARSH_HZ });
  return dB(energy(high) / energy(all));
}

/**
 * Everything the output stage adds, in dB below the sound: the render
 * compared with a perfectly linear one (turned far down, then scaled back up).
 */
async function distortion(sound: SoundId): Promise<number> {
  const LINEAR = 1000;
  const real = await render(sound);
  const clean = await render(sound, { outputGain: OUTPUT_GAIN / LINEAR });
  let signal = 0;
  let error = 0;
  for (let i = 0; i < real.length; i++) {
    const expected = clean[i]! * LINEAR;
    signal += expected * expected;
    error += (real[i]! - expected) ** 2;
  }
  return dB(error / signal);
}

// Measured from the square-wave sounds these replaced, the same way. The
// struck sounds trade up to 3dB of that for clean tones (pace gained instead).
const SQUARE_WAVE_LOUDNESS: Record<SoundId, number> = {
  tick: -6.6,
  go: -5.4,
  rest: -4.8,
  pace: -13.0,
  finish: -4.2,
};

describe('loudness through a phone speaker', () => {
  test.each(Object.entries(SQUARE_WAVE_LOUDNESS) as [SoundId, number][])(
    '%s is within 3dB of the square wave it replaced (%d dBFS)',
    async (sound, before) => {
      expect(await loudness(sound)).toBeGreaterThanOrEqual(before - 3);
    },
  );

  // Three quick notes are far harder to miss than one tick at the same level,
  // so matching the tick is enough; louder would drive the clip.
  test('pace is as loud as the tick, within 1dB', async () => {
    expect(await loudness('pace')).toBeGreaterThanOrEqual(
      (await loudness('tick')) - 1,
    );
  });
});

describe('pleasantness', () => {
  // About 0.3%: far below audible. Driving the clip past ±1 measured -10dB.
  test.each(['tick', 'go', 'rest', 'pace', 'finish'] as const)(
    '%s plays without audible distortion',
    async (sound) => {
      expect(await distortion(sound)).toBeLessThanOrEqual(-50);
    },
  );

  // The square waves put 6–10dB of their energy above 4kHz.
  test.each(['tick', 'go', 'rest', 'pace', 'finish'] as const)(
    '%s keeps under 1/20th of its energy above 4kHz',
    async (sound) => {
      expect(await harshness(sound)).toBeLessThanOrEqual(-13);
    },
  );
});

test('stop fades a ringing sound to silence', async () => {
  // Stop the finish chord half a second in, while it's ringing.
  const data = await render('finish', { stopAt: 0.5 });
  const at = (seconds: number) => Math.round(seconds * RATE);
  const before = energy(data, at(0.4), at(0.5));
  expect(before).toBeGreaterThan(0.1);
  // Only the room's faint tail is left in the next 100ms…
  expect(dB(energy(data, at(0.52), at(0.62)) / before)).toBeLessThan(-25);
  // …and once it has rung out (0.25s), nothing.
  expect(energy(data, at(0.8))).toBeLessThan(1e-6);
});

test.each([
  // Each window starts after a cut at the shortest layer's end would have
  // rung out through the room.
  ['tick', 0.45],
  ['go', 0.8],
])(
  '%s rings out for its longest layer, not just its last-listed one',
  async (sound, from) => {
    const data = await render(sound as SoundId);
    const at = (seconds: number) => Math.round(seconds * RATE);
    expect(energy(data, at(from), at(from + 0.1))).toBeGreaterThan(1e-6);
  },
);
