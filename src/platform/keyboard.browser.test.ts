import { describe, expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { Runner } from '../core/runner';
import { mount } from '../test/browserSetup';
import { FakeClock, ManualFrames } from '../test/fakes';
import { buildProgram } from '../test/helpers';
import { h } from '../ui/h';
import { createRunView } from '../ui/runView';
import { bindShortcuts } from './keyboard';

describe('bindShortcuts', () => {
  test('ignores keys typed into inputs', async () => {
    const space = vi.fn();
    const unbind = bindShortcuts({ space, r: space });
    mount(h('input', { 'aria-label': 'Name' }));
    await userEvent.click(page.getByRole('textbox', { name: 'Name' }));
    await userEvent.keyboard(' r');
    expect(space).not.toHaveBeenCalled();
    unbind();
  });

  test('on a focused button, leaves Space to the button but still handles R', async () => {
    const space = vi.fn();
    const r = vi.fn();
    const unbind = bindShortcuts({ space, r });
    let clicks = 0;
    mount(h('button', { type: 'button', onclick: () => clicks++ }, 'Thing'));
    page.getByRole('button', { name: 'Thing' }).element().focus();
    await userEvent.keyboard(' r');
    expect(clicks).toBe(1);
    expect(space).not.toHaveBeenCalled();
    expect(r).toHaveBeenCalledOnce();
    unbind();
  });

  test('ignores modified keys', async () => {
    const r = vi.fn();
    const unbind = bindShortcuts({ r });
    await userEvent.keyboard('{Control>}r{/Control}');
    expect(r).not.toHaveBeenCalled();
    unbind();
  });

  test('unbind removes the listener', async () => {
    const space = vi.fn();
    bindShortcuts({ space })();
    await userEvent.keyboard(' ');
    expect(space).not.toHaveBeenCalled();
  });
});

describe('run view shortcuts', () => {
  function setup() {
    const clock = new FakeClock();
    const frames = new ManualFrames();
    const program = buildProgram('tabata');
    const runner = new Runner(program, clock);
    const onBack = vi.fn();
    const view = createRunView({
      program,
      runner,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
      onBack,
    });
    mount(view.el);
    onTestFinished(() => view.destroy());
    return { clock, runner, view, onBack, program };
  }

  test('Space starts, pauses and resumes', async () => {
    const { runner } = setup();
    await userEvent.keyboard(' ');
    expect(runner.state).toBe('running');
    await userEvent.keyboard(' ');
    expect(runner.state).toBe('paused');
    await userEvent.keyboard(' ');
    expect(runner.state).toBe('running');
  });

  test('Space on a focused button activates it only once', async () => {
    const { runner, view } = setup();
    view.focus();
    await userEvent.keyboard(' ');
    expect(runner.state).toBe('running');
    // Focus is on the same button, now Pause.
    await userEvent.keyboard(' ');
    expect(runner.state).toBe('paused');
  });

  test('R opens the reset dialog while running; shortcuts are inert while it is open', async () => {
    const { runner } = setup();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('r');
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await userEvent.keyboard(' ');
    expect(runner.state).toBe('running');
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    expect(runner.state).toBe('running');
  });

  test('Esc goes back to setup only when idle or finished', async () => {
    const { runner, onBack, clock, program } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledTimes(1);
    runner.start();
    await userEvent.keyboard('{Escape}');
    runner.pause();
    await userEvent.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledTimes(1);
    runner.resume();
    clock.advance(program.totalMs);
    await userEvent.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  test('R resets without asking once finished', async () => {
    const { runner, clock, program } = setup();
    runner.start();
    clock.advance(program.totalMs);
    await userEvent.keyboard('r');
    expect(runner.state).toBe('idle');
  });
});
