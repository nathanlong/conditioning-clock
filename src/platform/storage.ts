import type {
  CommonConfig,
  FieldSpec,
  ModeConfig,
  ModeDefinition,
  ModeId,
} from '../core/types';
import { COMMON_DEFAULTS, COMMON_FIELDS } from '../modes/common';
import { isModeId } from '../modes/index';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Every project on the custom domain shares one origin, and so one
// localStorage: the prefix is required.
const PREFIX = 'cc:v1:';

export const keys = {
  settings: (modeId: ModeId) => `${PREFIX}settings:${modeId}`,
  common: `${PREFIX}common`,
  lastMode: `${PREFIX}lastMode`,
  activeRun: `${PREFIX}activeRun`,
};

/** Falls back to memory when localStorage is unavailable. */
export function browserStorage(): KeyValueStore {
  try {
    const store = window.localStorage;
    if (store) return store;
  } catch {
    // Blocked by the browser.
  }
  const memory = new Map<string, string>();
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };
}

export function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function writeJson(
  store: KeyValueStore,
  key: string,
  value: unknown,
): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: settings just aren't remembered.
  }
}

export function remove(store: KeyValueStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

/**
 * Merges stored values over the defaults field by field, clamping numbers to
 * each field's range, so a bad or old value falls back to the default.
 */
export function sanitize<C extends ModeConfig>(
  fields: FieldSpec<C>[],
  defaults: C,
  raw: unknown,
): C {
  const result = { ...defaults };
  if (typeof raw !== 'object' || raw === null) return result;
  const stored = raw as Record<string, unknown>;
  for (const field of fields) {
    const value = stored[field.key];
    if (field.kind === 'toggle') {
      if (typeof value === 'boolean')
        result[field.key] = value as C[typeof field.key];
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      const { min = -Infinity, max = Infinity } = field;
      const clamped = Math.min(max, Math.max(min, value));
      const whole = field.kind === 'number' ? Math.round(clamped) : clamped;
      result[field.key] = whole as C[typeof field.key];
    }
  }
  return result;
}

export function loadModeConfig<C extends ModeConfig>(
  store: KeyValueStore,
  mode: ModeDefinition<C>,
): C {
  return sanitize(
    mode.fields,
    mode.defaults,
    readJson(store, keys.settings(mode.id)),
  );
}

export function saveModeConfig(
  store: KeyValueStore,
  modeId: ModeId,
  config: ModeConfig,
): void {
  writeJson(store, keys.settings(modeId), config);
}

export function loadCommon(store: KeyValueStore): CommonConfig {
  return sanitizeCommon(readJson(store, keys.common));
}

export function sanitizeCommon(raw: unknown): CommonConfig {
  return sanitize(COMMON_FIELDS, { ...COMMON_DEFAULTS }, raw) as CommonConfig;
}

export function saveCommon(store: KeyValueStore, common: CommonConfig): void {
  writeJson(store, keys.common, common);
}

export function loadLastMode(store: KeyValueStore): ModeId | undefined {
  const value = readJson(store, keys.lastMode);
  return isModeId(value) ? value : undefined;
}

export function saveLastMode(store: KeyValueStore, modeId: ModeId): void {
  writeJson(store, keys.lastMode, modeId);
}
