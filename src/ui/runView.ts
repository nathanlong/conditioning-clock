import type { Runner } from '../core/runner';
import { snapshot } from '../core/snapshot';
import type { Program, RunState } from '../core/types';
import { bindShortcuts } from '../platform/keyboard';
import { createAnnouncer } from './announcer';
import { createConfirmDialog } from './confirmDialog';
import { h, setText, svg } from './h';
import {
  countsUp,
  digitsText,
  documentTitle,
  finishedAnnouncement,
  firstWork,
  isFinalCountdown,
  paceCounter,
  pausedAnnouncement,
  roundCounter,
  segmentAnnouncement,
  statusLabel,
} from './labels';
import { ringState } from './ringState';
import { createRings } from './rings';

export interface RunViewOptions {
  program: Program;
  runner: Runner;
  /** Defaults to requestAnimationFrame. */
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  /** Covers the view with a "Tap to resume sound" button. */
  recovered?: boolean;
  /** Called synchronously inside taps that start or resume sound. */
  onGesture?: () => void;
  onBack(): void;
}

export interface RunView {
  el: HTMLElement;
  focus(): void;
  showSoundBanner(show: boolean): void;
  destroy(): void;
}

const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
};

function icon(path: string) {
  return svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'icon',
    },
    svg('path', { d: path }),
  );
}

export function createRunView(options: RunViewOptions): RunView {
  const { program, runner, onGesture = () => {} } = options;
  const requestFrame =
    options.requestFrame ?? ((cb) => requestAnimationFrame(cb));
  const cancelFrame = options.cancelFrame ?? ((id) => cancelAnimationFrame(id));

  const announcer = createAnnouncer();
  const rings = createRings(program.display.overallRing, program.display.ticks);
  const status = h('p', { class: 'status' });
  const digits = h('div', { role: 'timer', class: 'digits' });
  const round = h('p', { class: 'round' });
  const pace = program.pace ? h('p', { class: 'pace' }) : null;
  const dial = h(
    'div',
    { class: 'dial' },
    rings.el,
    h('div', { class: 'readout' }, status, digits, round, pace),
  );

  const primaryIcon = h('span', { class: 'icon-slot' });
  const primaryText = h('span');
  const primary = h(
    'button',
    {
      type: 'button',
      class: 'control primary',
      'aria-keyshortcuts': 'Space',
      onclick: () => togglePrimary(),
    },
    primaryIcon,
    primaryText,
  );
  const reset = h(
    'button',
    {
      type: 'button',
      class: 'control',
      'aria-keyshortcuts': 'R',
      onclick: () => void requestReset(),
    },
    'Reset',
  );
  const done = countsUp(program)
    ? h(
        'button',
        { type: 'button', class: 'control done', onclick: () => runner.done() },
        'Done',
      )
    : null;
  const back = h(
    'button',
    {
      type: 'button',
      class: 'control',
      'aria-keyshortcuts': 'Escape',
      onclick: () => options.onBack(),
    },
    'Back to setup',
  );
  const controls = h('div', { class: 'controls' }, primary, done, reset, back);
  const hint = h(
    'p',
    { class: 'hint' },
    h('kbd', null, 'Space'),
    ' start / pause · ',
    h('kbd', null, 'R'),
    ' reset · ',
    h('kbd', null, 'Esc'),
    ' back to setup',
  );
  const content = h('div', { class: 'run-content' }, dial, controls, hint);

  const dialog = createConfirmDialog({
    title: 'Reset the workout?',
    message: 'This stops the timer and returns to the start.',
    confirmLabel: 'Reset',
  });

  const banner = h(
    'button',
    {
      type: 'button',
      class: 'banner',
      hidden: true,
      onclick: () => onGesture(),
    },
    'Sound is off. Tap to enable sound',
  );

  let overlay: HTMLButtonElement | null = null;
  if (options.recovered) {
    overlay = h(
      'button',
      {
        type: 'button',
        class: 'overlay',
        onclick: (event: Event) => {
          // Swallow this tap so it can't also hit Pause or Reset.
          event.stopPropagation();
          onGesture();
          overlay?.remove();
          overlay = null;
          content.inert = false;
          focus();
        },
      },
      'Tap to resume sound',
    );
    content.inert = true;
  }

  const el = h(
    'main',
    { class: 'run' },
    banner,
    content,
    dialog.el,
    announcer.el,
    overlay,
  );

  // Render bookkeeping.
  let frameId: number | null = null;
  let lastSegmentIndex = -1;
  let lastPaceReps = 0;
  let lastTitle = '';

  function render(): RunState {
    const elapsed = runner.elapsedMs();
    const state = runner.state;
    const snap = snapshot(program, elapsed);
    const ring = ringState(program, snap, state);
    rings.set(ring);

    const digitText = digitsText(program, snap, state);
    const label = statusLabel(state, snap.segment);
    setText(digits, digitText);
    setText(status, label);
    setText(
      round,
      roundCounter(state === 'idle' ? firstWork(program) : snap.segment),
    );
    if (pace) {
      setText(pace, paceCounter(program, snap));
      const reps = snap.completedPaceReps ?? 0;
      if (state === 'running' && reps > lastPaceReps)
        restartAnimation(pace, 'bump');
      lastPaceReps = reps;
    }
    if (dial.dataset.tone !== ring.main.tone)
      dial.dataset.tone = ring.main.tone;
    const final = String(isFinalCountdown(program, snap, state));
    if (dial.dataset.final !== final) dial.dataset.final = final;
    // The main ring shows the lead-in then, not the work it divides.
    const leadIn = String(
      (state === 'running' || state === 'paused') &&
        snap.segment.kind === 'leadIn',
    );
    if (dial.dataset.leadIn !== leadIn) dial.dataset.leadIn = leadIn;

    if (
      state === 'running' &&
      snap.segmentIndex !== lastSegmentIndex &&
      lastSegmentIndex !== -1
    ) {
      const text = segmentAnnouncement(snap.segment);
      if (text) announcer.announce(text);
      if (snap.segment.kind !== 'leadIn') restartAnimation(rings.main, 'pulse');
    }
    lastSegmentIndex = state === 'idle' ? -1 : snap.segmentIndex;

    const title = documentTitle(state, digitText, label);
    if (title !== lastTitle) document.title = lastTitle = title;
    return state;
  }

  function restartAnimation(target: Element, className: string) {
    target.classList.remove(className);
    // Reading layout restarts the CSS animation.
    void (target as HTMLElement).getBoundingClientRect();
    target.classList.add(className);
  }

  function loop() {
    frameId = null;
    if (render() === 'running') frameId = requestFrame(loop);
  }

  function updateControls(state: RunState) {
    const active = document.activeElement;
    el.dataset.state = state;
    primary.hidden = state === 'finished';
    const resuming = state === 'paused';
    primaryText.textContent =
      state === 'running' ? 'Pause' : resuming ? 'Resume' : 'Start';
    primaryIcon.replaceChildren(
      icon(state === 'running' ? ICONS.pause : ICONS.play),
    );
    reset.hidden = state === 'idle';
    if (done) done.hidden = state !== 'running' && state !== 'paused';
    back.hidden = state !== 'idle' && state !== 'finished';
    // Don't strand keyboard focus on a control that just disappeared, or on
    // the page (WebKit doesn't focus buttons on click).
    const stranded =
      active === document.body ||
      (active instanceof HTMLElement &&
        controls.contains(active) &&
        active.hidden);
    if (stranded && el.isConnected) focus();
  }

  function onState(state: RunState, prev: RunState) {
    render();
    updateControls(state);
    const snap = snapshot(program, runner.elapsedMs());
    if (state === 'running' && prev === 'idle') {
      const text = segmentAnnouncement(snap.segment);
      if (text) announcer.announce(text);
    } else if (state === 'running') {
      announcer.announce('Resumed');
    } else if (state === 'paused') {
      announcer.announce(pausedAnnouncement(digits.textContent ?? ''));
    } else if (state === 'finished') {
      announcer.announce(finishedAnnouncement(program, snap));
    }
    if (state === 'running' && frameId === null) frameId = requestFrame(loop);
  }

  function togglePrimary() {
    switch (runner.state) {
      case 'idle':
        onGesture();
        runner.start();
        break;
      case 'running':
        runner.pause();
        break;
      case 'paused':
        onGesture();
        runner.resume();
        break;
    }
  }

  async function requestReset() {
    if (runner.state === 'idle') return;
    if (runner.state === 'running' || runner.state === 'paused') {
      if (!(await dialog.open(reset))) return;
    }
    runner.reset();
    primary.focus();
  }

  function focus() {
    if (overlay) overlay.focus();
    else if (!primary.hidden) primary.focus();
    else back.focus();
  }

  const unsubscribe = runner.on(onState);
  const unbind = bindShortcuts({
    space: () => !overlay && togglePrimary(),
    r: () => !overlay && void requestReset(),
    escape: () => {
      if (!overlay && (runner.state === 'idle' || runner.state === 'finished'))
        options.onBack();
    },
  });

  render();
  updateControls(runner.state);
  if (runner.state === 'running') frameId = requestFrame(loop);

  return {
    el,
    focus,
    showSoundBanner(show) {
      banner.hidden = !show;
    },
    destroy() {
      unsubscribe();
      unbind();
      if (frameId !== null) cancelFrame(frameId);
      if (dialog.el.open) dialog.el.close();
      document.title = documentTitle('idle', '', '');
      el.remove();
    },
  };
}
