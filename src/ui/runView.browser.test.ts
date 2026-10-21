import { describe, expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { Runner } from '../core/runner';
import type { ModeId } from '../core/types';
import { mount } from '../test/browserSetup';
import { FakeClock, ManualFrames } from '../test/fakes';
import { buildProgram } from '../test/helpers';
import { createRunView } from './runView';

function setup(
  modeId: ModeId = 'tabata',
  overrides = {},
  options: { recovered?: boolean } = {},
) {
  const clock = new FakeClock();
  const frames = new ManualFrames();
  const program = buildProgram(modeId, overrides);
  const runner = new Runner(program, clock);
  const onBack = vi.fn();
  const onGesture = vi.fn();
  const view = createRunView({
    program,
    runner,
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
    onBack,
    onGesture,
    ...options,
  });
  mount(view.el);
  onTestFinished(() => view.destroy());
  view.focus();
  /** Moves time and renders one frame. */
  const at = (ms: number) => {
    clock.advance(ms);
    frames.flush();
  };
  return { clock, frames, program, runner, view, onBack, onGesture, at };
}

const timer = () => page.getByRole('timer');
const dial = () => document.querySelector<HTMLElement>('.dial')!;
const mainFill = () => document.querySelector('.ring.main .fill')!;
const overallRing = () => document.querySelector('.ring.overall');

describe('idle', () => {
  test('shows Ready, gray, and the first work segment time', async () => {
    setup();
    await expect.element(page.getByText('Ready')).toBeVisible();
    await expect.element(timer()).toHaveTextContent('0:20');
    await expect.element(page.getByText('Round 1 / 8')).toBeVisible();
    expect(dial().dataset.tone).toBe('idle');
    expect(overallRing()!.getAttribute('data-tone')).toBe('idle');
  });

  test('focuses Start, offers Back to setup, hides Reset', async () => {
    setup();
    await expect
      .element(page.getByRole('button', { name: 'Start' }))
      .toHaveFocus();
    await expect
      .element(page.getByRole('button', { name: 'Back to setup' }))
      .toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Reset' }))
      .not.toBeInTheDocument();
  });

  test('the digits are a timer and the rings are hidden from assistive tech', async () => {
    setup();
    await expect.element(timer()).toBeInTheDocument();
    expect(
      document.querySelector('svg.rings')!.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  test('declares keyboard shortcuts on the matching buttons', async () => {
    setup();
    await expect
      .element(page.getByRole('button', { name: 'Start' }))
      .toHaveAttribute('aria-keyshortcuts', 'Space');
    await expect
      .element(page.getByRole('button', { name: 'Back to setup' }))
      .toHaveAttribute('aria-keyshortcuts', 'Escape');
  });
});

describe('running', () => {
  test('Start calls the gesture hook before starting', async () => {
    const { runner, onGesture } = setup();
    onGesture.mockImplementation(() => expect(runner.state).toBe('idle'));
    await userEvent.click(page.getByRole('button', { name: 'Start' }));
    expect(onGesture).toHaveBeenCalledOnce();
    expect(runner.state).toBe('running');
  });

  test('renders the lead-in, then work and rest at exact times', async () => {
    const { runner, at } = setup();
    runner.start();
    at(2_500);
    await expect.element(page.getByText('Get Ready')).toBeVisible();
    expect(timer().element().textContent).toBe('0:08');
    expect(mainFill().getAttribute('stroke-dashoffset')).toBe('0.75');
    expect(dial().dataset.tone).toBe('rest');

    at(7_500 + 5_000); // 15s: 5s into round 1 work
    expect(page.getByText('Work').element()).toBeVisible();
    expect(dial().dataset.tone).toBe('work');
    expect(timer().element().textContent).toBe('0:15');
    expect(page.getByText('Round 1 / 8').element()).toBeVisible();
    expect(mainFill().getAttribute('stroke-dashoffset')).toBe('0.75');

    at(15_000); // 30s: rest
    expect(page.getByText('Rest').element()).toBeVisible();
    expect(timer().element().textContent).toBe('0:10');
    expect(dial().dataset.tone).toBe('rest');
    expect(overallRing()!.getAttribute('data-tone')).toBe('overall');
  });

  test('marks the true end of the fill with a dot', async () => {
    const { runner, at } = setup();
    const head = () =>
      document.querySelector<SVGCircleElement>('.ring.main .head')!;
    expect(head().style.visibility).toBe('hidden');
    runner.start();
    at(15_000); // a quarter through round 1 work
    // A quarter turn from 12 o'clock, drawn before the ring's -90° rotation.
    expect(Number(head().getAttribute('cx'))).toBeCloseTo(100, 5);
    expect(Number(head().getAttribute('cy'))).toBeCloseTo(100 + 78, 5);
    expect(head().style.visibility).toBe('');
  });

  test('keeps rendering only while running', async () => {
    const { runner, frames, at } = setup();
    expect(frames.pending).toBe(0);
    runner.start();
    expect(frames.pending).toBe(1);
    at(1_000);
    expect(frames.pending).toBe(1);
    runner.pause();
    frames.flush();
    expect(frames.pending).toBe(0);
  });

  test('marks the final 5 seconds of the lead-in for heavier digits', async () => {
    const { runner, at } = setup();
    runner.start();
    at(4_999);
    expect(dial().dataset.final).toBe('false');
    at(1);
    expect(dial().dataset.final).toBe('true');
  });

  test('updates the document title', async () => {
    const { runner, at } = setup();
    runner.start();
    at(12_000);
    expect(document.title).toBe('0:18 Work · Conditioning Clock');
  });

  test('AMRAP shows the pace target', async () => {
    const { runner, at } = setup('amrap', {
      repGoalEnabled: true,
      repGoal: 60,
    });
    runner.start();
    at(10_000 + 24 * 12_000);
    await expect.element(page.getByText('Target 24 / 60')).toBeVisible();
  });

  test('AMRAP ticks the main ring at each pace division, lead-in included', async () => {
    const { runner, at } = setup('amrap', {
      repGoalEnabled: true,
      repGoal: 4,
    });
    const ticks = document.querySelector('.ticks.main')!;
    expect(ticks.querySelectorAll('line')).toHaveLength(4);
    expect(getComputedStyle(ticks).visibility).toBe('visible');
    runner.start();
    at(1_000);
    expect(getComputedStyle(ticks).visibility).toBe('visible');
    at(10_000);
    expect(getComputedStyle(ticks).visibility).toBe('visible');
  });

  test('Tabata ticks the overall ring at every round', async () => {
    setup();
    expect(document.querySelectorAll('.ticks.overall line')).toHaveLength(8);
    expect(document.querySelector('.ticks.main')).toBeNull();
  });

  test('For Time with a goal keeps running past it, filling the overall ring toward it', async () => {
    const { runner, at } = setup('forTime', { goalEnabled: true, goalMin: 1 });
    await expect.element(page.getByText('Goal 1:00')).toBeVisible();
    runner.start();
    at(10_000 + 30_000);
    expect(
      overallRing()!.querySelector('.fill')!.getAttribute('stroke-dashoffset'),
    ).toBe('0.5');
    at(45_000);
    expect(runner.state).toBe('running');
    expect(timer().element().textContent).toBe('1:15');
    expect(page.getByText('Goal 1:00 · +0:15').element()).toBeVisible();
    expect(
      overallRing()!.querySelector('.fill')!.getAttribute('stroke-dashoffset'),
    ).toBe('0');
  });

  test('For Time counts up and wraps the ring each minute', async () => {
    const { runner, at } = setup('forTime');
    runner.start();
    at(10_000 + 30_000);
    expect(timer().element().textContent).toBe('0:30');
    expect(mainFill().getAttribute('stroke-dashoffset')).toBe('0.5');
    at(30_000);
    expect(timer().element().textContent).toBe('1:00');
    expect((mainFill() as SVGElement).style.visibility).toBe('hidden');
    expect(overallRing()).toBeNull();
  });
});

describe('paused', () => {
  test('turns red, says Paused, and freezes the digits', async () => {
    const { runner, at } = setup();
    runner.start();
    at(15_000);
    await userEvent.click(page.getByRole('button', { name: 'Pause' }));
    await expect
      .element(page.getByText('Paused', { exact: true }))
      .toBeVisible();
    expect(dial().dataset.tone).toBe('paused');
    expect(overallRing()!.getAttribute('data-tone')).toBe('overall');
    at(20_000);
    expect(timer().element().textContent).toBe('0:15');
    await expect
      .element(page.getByRole('button', { name: 'Resume' }))
      .toBeVisible();
  });

  test('Resume calls the gesture hook and continues', async () => {
    const { runner, at, onGesture } = setup();
    runner.start();
    at(15_000);
    runner.pause();
    onGesture.mockClear();
    await userEvent.click(page.getByRole('button', { name: 'Resume' }));
    expect(onGesture).toHaveBeenCalledOnce();
    at(1_000);
    expect(timer().element().textContent).toBe('0:14');
  });
});

describe('finished', () => {
  test('both rings full, Done, 0:00', async () => {
    const { runner, at, program } = setup();
    runner.start();
    at(program.totalMs);
    await expect.element(page.getByText('Done', { exact: true })).toBeVisible();
    expect(timer().element().textContent).toBe('0:00');
    expect(mainFill().getAttribute('stroke-dashoffset')).toBe('0');
    expect(
      document
        .querySelector('.ring.overall .fill')!
        .getAttribute('stroke-dashoffset'),
    ).toBe('0');
    await expect
      .element(page.getByRole('button', { name: 'Back to setup' }))
      .toBeVisible();
  });

  test('For Time Done shows the final time and moves focus off the vanished button', async () => {
    const { runner, at } = setup('forTime');
    runner.start();
    at(10_000 + 754_400);
    await userEvent.click(page.getByRole('button', { name: 'Done' }));
    expect(timer().element().textContent).toBe('12:34');
    await expect
      .element(page.getByRole('button', { name: 'Back to setup' }))
      .toHaveFocus();
  });

  test('Back to setup calls onBack', async () => {
    const { onBack } = setup();
    await userEvent.click(page.getByRole('button', { name: 'Back to setup' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('reset dialog', () => {
  test.each(['running', 'paused'] as const)(
    'opens when %s; Esc closes it and focus returns to Reset',
    async (state) => {
      const { runner, at } = setup();
      runner.start();
      at(5_000);
      if (state === 'paused') runner.pause();
      await userEvent.click(page.getByRole('button', { name: 'Reset' }));
      const dialog = page.getByRole('dialog', { name: 'Reset the workout?' });
      await expect.element(dialog).toBeVisible();
      await expect
        .element(page.getByRole('button', { name: 'Cancel' }))
        .toHaveFocus();
      await userEvent.keyboard('{Escape}');
      await expect.element(dialog).not.toBeInTheDocument();
      await expect
        .element(page.getByRole('button', { name: 'Reset' }))
        .toHaveFocus();
      expect(runner.state).toBe(state);
    },
  );

  test('confirming resets to idle and focuses Start', async () => {
    const { runner, at } = setup();
    runner.start();
    at(5_000);
    await userEvent.click(page.getByRole('button', { name: 'Reset' }));
    await userEvent.click(
      page.getByRole('dialog').getByRole('button', { name: 'Reset' }),
    );
    expect(runner.state).toBe('idle');
    await expect
      .element(page.getByRole('button', { name: 'Start' }))
      .toHaveFocus();
  });

  test('does not ask once finished', async () => {
    const { runner, at, program } = setup();
    runner.start();
    at(program.totalMs);
    await userEvent.click(page.getByRole('button', { name: 'Reset' }));
    expect(runner.state).toBe('idle');
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('announcer', () => {
  const status = () => page.getByRole('status').element().textContent!.trim();

  test('announces state and segment changes, but not ticks', async () => {
    const { runner, at } = setup();
    runner.start();
    expect(status()).toBe('Get ready, 10 seconds');
    at(7_000);
    at(1_000);
    at(1_000);
    expect(status()).toBe('Get ready, 10 seconds');
    at(1_000);
    expect(status()).toBe('Round 1 of 8, work');
    at(20_000);
    expect(status()).toBe('Rest, 10 seconds');
    runner.pause();
    expect(status()).toBe('Paused at 0:10');
    runner.resume();
    expect(status()).toBe('Resumed');
  });

  test('announces completion with the final time for For Time', async () => {
    const { runner, at } = setup('forTime');
    runner.start();
    at(10_000 + 754_000);
    runner.done();
    expect(status()).toBe('Workout complete. Final time 12:34');
  });

  test('announces the For Time goal once, as it is reached', async () => {
    const { runner, at } = setup('forTime', { goalEnabled: true, goalMin: 1 });
    runner.start();
    at(10_000 + 59_000);
    expect(status()).not.toBe('Goal reached');
    at(1_000);
    expect(status()).toBe('Goal reached');
    expect(page.getByText('Goal 1:00 · +0:00').element()).toBeVisible();
    at(30_000);
    runner.done();
    expect(status()).toBe('Workout complete. Final time 1:30, 0:30 over goal');
  });
});

describe('recovery overlay', () => {
  test('covers the view, receives focus, and swallows the first tap', async () => {
    const clock = new FakeClock();
    const frames = new ManualFrames();
    const program = buildProgram('tabata');
    const runner = Runner.restore(program, clock, {
      state: 'running',
      elapsedMs: 15_000,
      startedAtWall: 0,
      pausedTotalMs: 0,
    });
    const onGesture = vi.fn();
    const view = createRunView({
      program,
      runner,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
      recovered: true,
      onGesture,
      onBack: vi.fn(),
    });
    mount(view.el);
    onTestFinished(() => view.destroy());
    view.focus();
    const overlay = page.getByRole('button', { name: 'Tap to resume sound' });
    await expect.element(overlay).toHaveFocus();
    // The controls underneath are inert until the overlay is gone.
    expect(
      page.getByRole('button', { name: 'Pause' }).element().closest('[inert]'),
    ).not.toBeNull();
    await userEvent.click(overlay);
    expect(onGesture).toHaveBeenCalledOnce();
    expect(runner.state).toBe('running');
    await expect.element(overlay).not.toBeInTheDocument();
    expect(
      page.getByRole('button', { name: 'Pause' }).element().closest('[inert]'),
    ).toBeNull();
    await expect
      .element(page.getByRole('button', { name: 'Pause' }))
      .toHaveFocus();
  });
});

test('destroy stops rendering and restores the title', () => {
  const { runner, view, frames, at } = setup();
  runner.start();
  at(12_000);
  view.destroy();
  expect(frames.pending).toBe(0);
  expect(document.title).toBe('Conditioning Clock');
});
