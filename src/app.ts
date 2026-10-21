import type { AudioEngine } from './audio/context';
import { AudioScheduler } from './audio/scheduler';
import type { Clock } from './core/clock';
import { Runner } from './core/runner';
import type { CommonConfig, ModeConfig, ModeId, Program } from './core/types';
import { getMode, modeList } from './modes/index';
import { attachPersistence, recover } from './platform/recovery';
import {
  loadCommon,
  loadLastMode,
  loadModeConfig,
  saveCommon,
  saveLastMode,
  saveModeConfig,
  type KeyValueStore,
} from './platform/storage';
import { WakeLockController, type WakeLockPort } from './platform/wakeLock';
import { createRunView } from './ui/runView';
import { createSetupView } from './ui/setupView';

export interface AppDeps {
  root: HTMLElement;
  clock: Clock;
  storage: KeyValueStore;
  audio: AudioEngine;
  wakeLock: WakeLockPort | null;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  /** Dev only: show the sound check buttons on setup. */
  soundCheck?: boolean;
}

interface Session {
  modeId: ModeId;
  config: ModeConfig;
  common: CommonConfig;
  program: Program;
  runner: Runner;
}

export interface App {
  destroy(): void;
}

/** Boot: load settings, attempt recovery, render. */
export function startApp(deps: AppDeps): App {
  const { root, clock, storage, audio } = deps;
  const wakeLock = new WakeLockController(deps.wakeLock);
  let teardown = () => {};

  function show(view: { el: HTMLElement; focus(): void }, focus = true) {
    root.replaceChildren(view.el);
    if (focus) view.focus();
  }

  function showSetup(focus = true) {
    teardown();
    const common = loadCommon(storage);
    const view = createSetupView({
      modes: modeList,
      initialModeId: loadLastMode(storage) ?? 'emom',
      loadConfig: (id) => loadModeConfig(storage, getMode(id)),
      common,
      onStart(modeId, config, commonValues) {
        saveModeConfig(storage, modeId, config);
        saveCommon(storage, commonValues);
        saveLastMode(storage, modeId);
        const program = getMode(modeId).build(config, commonValues);
        showRun(
          {
            modeId,
            config,
            common: commonValues,
            program,
            runner: new Runner(program, clock),
          },
          false,
        );
      },
      soundCheck: deps.soundCheck
        ? (sound, levels) => {
            audio.unlock();
            audio.setVolume(levels.volume, levels.muted);
            const port = audio.port();
            port?.play(sound, port.currentTime());
          }
        : undefined,
    });
    teardown = () => view.destroy();
    show(view, focus);
  }

  function showRun(session: Session, recovered: boolean) {
    teardown();
    const { program, runner, common } = session;
    let scheduler: AudioScheduler | null = null;
    let soundWasOn = false;

    const ensureAudio = () => {
      audio.unlock();
      audio.setVolume(common.volume, common.muted);
      const port = audio.port();
      if (port && !scheduler) {
        scheduler = new AudioScheduler(program, runner, port, clock);
        scheduler.attach();
        scheduler.setHidden(document.hidden);
      }
    };
    const holding = () =>
      runner.state === 'running' || runner.state === 'paused';

    const view = createRunView({
      program,
      runner,
      requestFrame: deps.requestFrame,
      cancelFrame: deps.cancelFrame,
      recovered,
      onGesture() {
        ensureAudio();
        // Recovery needs a gesture to re-acquire the lock too.
        wakeLock.set(holding());
      },
      onBack: () => showSetup(),
    });

    const offPersist = attachPersistence(runner, storage, session);
    const offWake = runner.on(() => wakeLock.set(holding()));
    const offAudio = audio.onStateChange((state) => {
      if (state === 'running') {
        soundWasOn = true;
        view.showSoundBanner(false);
        // Anything scheduled while suspended is off; start over from now.
        scheduler?.resync();
      } else if (soundWasOn && holding()) {
        // A phone call or Siri took the audio session.
        view.showSoundBanner(true);
      }
    });
    const onVisibility = () => {
      scheduler?.setHidden(document.hidden);
      if (!document.hidden) wakeLock.onVisible();
    };
    document.addEventListener('visibilitychange', onVisibility);

    teardown = () => {
      document.removeEventListener('visibilitychange', onVisibility);
      offAudio();
      offWake();
      offPersist();
      scheduler?.detach();
      wakeLock.set(false);
      view.destroy();
    };
    show(view);
  }

  const recoveredRun = recover(storage, clock);
  if (recoveredRun) {
    showRun(recoveredRun, recoveredRun.runner.state !== 'finished');
  } else {
    showSetup(false);
  }

  return { destroy: () => teardown() };
}
