import { describe, expect, onTestFinished, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { startApp } from './app';
import { Runner } from './core/runner';
import { modes } from './modes/index';
import { COMMON_DEFAULTS } from './modes/common';
import { attachPersistence } from './platform/recovery';
import { keys, readJson } from './platform/storage';
import {
  FakeAudioEngine,
  FakeClock,
  FakeWakeLock,
  ManualFrames,
  MemoryStorage,
} from './test/fakes';

function boot(storage = new MemoryStorage(), clock = new FakeClock()) {
  const root = document.createElement('div');
  root.id = 'app';
  document.body.append(root);
  const frames = new ManualFrames();
  const audio = new FakeAudioEngine(clock);
  const wakeLock = new FakeWakeLock();
  const app = startApp({
    root,
    clock,
    storage,
    audio,
    wakeLock,
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
  });
  onTestFinished(() => app.destroy());
  return { clock, storage, frames, audio, wakeLock };
}

async function startTabata() {
  await userEvent.click(page.getByRole('radio', { name: 'Tabata' }));
  await userEvent.click(page.getByRole('button', { name: 'Start' }));
}

describe('view switches', () => {
  test('setup Start opens the run view idle, with Start focused', async () => {
    boot();
    await startTabata();
    await expect.element(page.getByText('Ready')).toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Start' }))
      .toHaveFocus();
  });

  test('Back to setup focuses the mode picker', async () => {
    boot();
    await startTabata();
    await userEvent.click(page.getByRole('button', { name: 'Back to setup' }));
    await expect
      .element(page.getByRole('radio', { name: 'Tabata' }))
      .toHaveFocus();
  });

  test('settings are saved when a run starts', async () => {
    const { storage } = boot();
    await userEvent.click(page.getByRole('radio', { name: 'Tabata' }));
    await userEvent.fill(page.getByRole('spinbutton', { name: 'Rounds' }), '4');
    expect(readJson(storage, keys.settings('tabata'))).toBeUndefined();
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    expect(readJson(storage, keys.settings('tabata'))).toEqual({
      workSec: 20,
      restSec: 10,
      rounds: 4,
    });
    expect(readJson(storage, keys.lastMode)).toBe('tabata');
    expect(readJson(storage, keys.common)).toEqual(COMMON_DEFAULTS);
  });
});

describe('audio', () => {
  test('unlocks inside the Start tap and schedules cues', async () => {
    const { audio, clock } = boot();
    await startTabata();
    expect(audio.unlocks).toBe(0);
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    expect(audio.unlocks).toBe(1);
    expect(audio.level).toEqual({
      volume: COMMON_DEFAULTS.volume,
      muted: false,
    });
    clock.advance(3_000);
    expect(audio.audioPort.played.map((p) => p.sound)).toContain('tick');
  });

  test('shows a banner when the audio session is interrupted mid-run', async () => {
    const { audio } = boot();
    await startTabata();
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    audio.emit('running');
    audio.emit('interrupted');
    const banner = page.getByRole('button', {
      name: 'Sound is off. Tap to enable sound',
    });
    await expect.element(banner).toBeVisible();
    await userEvent.click(banner);
    expect(audio.unlocks).toBe(2);
    audio.emit('running');
    await expect.element(banner).not.toBeInTheDocument();
  });
});

describe('wake lock', () => {
  test('held while running and paused, released on finish', async () => {
    const { wakeLock, clock } = boot();
    await startTabata();
    expect(wakeLock.calls).toEqual([]);
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    await expect.poll(() => wakeLock.held).toBe(true);
    await userEvent.click(page.getByRole('button', { name: 'Pause' }));
    expect(wakeLock.held).toBe(true);
    await userEvent.click(page.getByRole('button', { name: 'Resume' }));
    clock.advance(10 * 60_000);
    await expect.poll(() => wakeLock.held).toBe(false);
    expect(wakeLock.calls).toEqual(['request', 'release']);
  });

  test('released on reset', async () => {
    const { wakeLock } = boot();
    await startTabata();
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    await expect.poll(() => wakeLock.held).toBe(true);
    await userEvent.click(page.getByRole('button', { name: 'Reset' }));
    await userEvent.click(
      page.getByRole('dialog').getByRole('button', { name: 'Reset' }),
    );
    await expect.poll(() => wakeLock.held).toBe(false);
  });
});

describe('recovery', () => {
  function storedRun(state: 'running' | 'paused') {
    const clock = new FakeClock();
    const storage = new MemoryStorage();
    const config = { rounds: 10 };
    const runner = new Runner(modes.emom.build(config, COMMON_DEFAULTS), clock);
    attachPersistence(runner, storage, {
      modeId: 'emom',
      config,
      common: COMMON_DEFAULTS,
    });
    runner.start();
    clock.advance(90_000);
    if (state === 'paused') runner.pause();
    return { storage, wall: clock.wallNow() };
  }

  test('a reload mid-run shows the overlay; tapping it resumes sound and the wake lock', async () => {
    const { storage, wall } = storedRun('running');
    const clock = new FakeClock();
    clock.wall = wall + 2_000;
    const { audio, wakeLock } = boot(storage, clock);
    const overlay = page.getByRole('button', { name: 'Tap to resume sound' });
    await expect.element(overlay).toHaveFocus();
    expect(audio.unlocks).toBe(0);
    await userEvent.click(overlay);
    expect(audio.unlocks).toBe(1);
    await expect.poll(() => wakeLock.held).toBe(true);
    // 92s into an EMOM with a 10s lead-in: round 2, 38s left.
    await expect.element(page.getByText('Round 2 / 10')).toBeVisible();
    await expect.element(page.getByRole('timer')).toHaveTextContent('0:38');
    await expect
      .element(page.getByRole('button', { name: 'Pause' }))
      .toHaveFocus();
  });

  test('a paused run comes back paused', async () => {
    const { storage, wall } = storedRun('paused');
    const clock = new FakeClock();
    clock.wall = wall + 60_000;
    boot(storage, clock);
    await userEvent.click(
      page.getByRole('button', { name: 'Tap to resume sound' }),
    );
    await expect
      .element(page.getByText('Paused', { exact: true }))
      .toBeVisible();
    await expect.element(page.getByRole('timer')).toHaveTextContent('0:40');
  });

  test('an overdue run shows finished, with no overlay', async () => {
    const { storage, wall } = storedRun('running');
    const clock = new FakeClock();
    clock.wall = wall + 20 * 60_000;
    boot(storage, clock);
    await expect.element(page.getByText('Done', { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Tap to resume sound' }))
      .not.toBeInTheDocument();
  });
});
