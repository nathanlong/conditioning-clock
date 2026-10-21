import { expect, test } from 'vitest';
import { FakeWakeLock } from '../test/fakes';
import { WakeLockController } from './wakeLock';

test('requests once and releases', async () => {
  const port = new FakeWakeLock();
  const lock = new WakeLockController(port);
  lock.set(true);
  lock.set(true);
  await lock.settled();
  expect(port.held).toBe(true);
  lock.set(false);
  expect(port.calls).toEqual(['request', 'release']);
  expect(port.held).toBe(false);
});

test('re-requests on visible after the browser released it', async () => {
  const port = new FakeWakeLock();
  const lock = new WakeLockController(port);
  lock.set(true);
  await lock.settled();
  port.systemRelease();
  lock.onVisible();
  await lock.settled();
  expect(port.calls).toEqual(['request', 'request']);
  expect(port.held).toBe(true);
});

test('does not re-request on visible when not wanted', async () => {
  const port = new FakeWakeLock();
  const lock = new WakeLockController(port);
  lock.onVisible();
  await lock.settled();
  expect(port.calls).toEqual([]);
});

test('releases a lock that arrives after it stopped being wanted', async () => {
  const port = new FakeWakeLock();
  const lock = new WakeLockController(port);
  lock.set(true);
  lock.set(false);
  await lock.settled();
  expect(port.held).toBe(false);
});

test('fails silently when rejected or unsupported', async () => {
  const port = new FakeWakeLock();
  port.reject = true;
  const lock = new WakeLockController(port);
  lock.set(true);
  await expect(lock.settled()).resolves.toBeUndefined();
  expect(() => new WakeLockController(null).set(true)).not.toThrow();
});
