import { describe, expect, test } from 'vitest';
import { COMMON_DEFAULTS } from '../modes/common';
import { modes } from '../modes/index';
import { MemoryStorage, ThrowingStorage } from '../test/fakes';
import {
  keys,
  loadCommon,
  loadLastMode,
  loadModeConfig,
  saveCommon,
  saveLastMode,
  saveModeConfig,
} from './storage';

describe('mode settings', () => {
  test('round-trip under a prefixed key', () => {
    const store = new MemoryStorage();
    saveModeConfig(store, 'tabata', { workSec: 40, restSec: 20, rounds: 5 });
    expect([...store.data.keys()]).toEqual(['cc:v1:settings:tabata']);
    expect(loadModeConfig(store, modes.tabata)).toEqual({
      workSec: 40,
      restSec: 20,
      rounds: 5,
    });
  });

  test('fall back to defaults when nothing is stored', () => {
    expect(loadModeConfig(new MemoryStorage(), modes.emom)).toEqual({
      rounds: 10,
    });
  });

  test('merge field by field over the defaults', () => {
    const store = new MemoryStorage();
    store.setItem(
      keys.settings('tabata'),
      JSON.stringify({ rounds: 4, extra: 'x' }),
    );
    expect(loadModeConfig(store, modes.tabata)).toEqual({
      workSec: 20,
      restSec: 10,
      rounds: 4,
    });
  });

  test('clamp numbers to the field range and reject wrong types', () => {
    const store = new MemoryStorage();
    store.setItem(
      keys.settings('tabata'),
      JSON.stringify({ workSec: 9999, restSec: 'ten', rounds: 2.6 }),
    );
    expect(loadModeConfig(store, modes.tabata)).toEqual({
      workSec: 300,
      restSec: 10,
      rounds: 3,
    });
  });

  test('only accept booleans for toggles', () => {
    const store = new MemoryStorage();
    store.setItem(
      keys.settings('forTime'),
      JSON.stringify({ capEnabled: 'yes', capMin: 0 }),
    );
    expect(loadModeConfig(store, modes.forTime)).toEqual({
      capEnabled: false,
      capMin: 1,
    });
  });

  test('ignore corrupt JSON', () => {
    const store = new MemoryStorage();
    store.setItem(keys.settings('emom'), '{nope');
    expect(loadModeConfig(store, modes.emom)).toEqual({ rounds: 10 });
  });
});

describe('common settings', () => {
  test('round-trip', () => {
    const store = new MemoryStorage();
    saveCommon(store, { leadInSec: 5, volume: 0.5, muted: true });
    expect(loadCommon(store)).toEqual({
      leadInSec: 5,
      volume: 0.5,
      muted: true,
    });
  });

  test('clamp volume to 0–1 without rounding it', () => {
    const store = new MemoryStorage();
    store.setItem(keys.common, JSON.stringify({ volume: 4, leadInSec: 45 }));
    expect(loadCommon(store)).toEqual({
      ...COMMON_DEFAULTS,
      volume: 1,
      leadInSec: 30,
    });
    store.setItem(keys.common, JSON.stringify({ volume: 0.35 }));
    expect(loadCommon(store).volume).toBe(0.35);
  });
});

describe('last mode', () => {
  test('round-trips a known mode and rejects others', () => {
    const store = new MemoryStorage();
    expect(loadLastMode(store)).toBeUndefined();
    saveLastMode(store, 'amrap');
    expect(loadLastMode(store)).toBe('amrap');
    store.setItem(keys.lastMode, JSON.stringify('zumba'));
    expect(loadLastMode(store)).toBeUndefined();
  });
});

test('every read and write survives a throwing store', () => {
  const store = new ThrowingStorage();
  expect(() => saveModeConfig(store, 'emom', { rounds: 3 })).not.toThrow();
  expect(() => saveCommon(store, COMMON_DEFAULTS)).not.toThrow();
  expect(() => saveLastMode(store, 'emom')).not.toThrow();
  expect(loadModeConfig(store, modes.emom)).toEqual({ rounds: 10 });
  expect(loadCommon(store)).toEqual(COMMON_DEFAULTS);
  expect(loadLastMode(store)).toBeUndefined();
});
