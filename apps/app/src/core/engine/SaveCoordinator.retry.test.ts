import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_RETRY_DELAYS_MS, SaveCoordinator } from './SaveCoordinator';
import { DocumentSession } from './DocumentSession';
import { DocumentTransaction } from './DocumentTransaction';

describe('SaveCoordinator: bounded retry scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires after each backoff step, then refuses once the steps are used up', () => {
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();

    for (const delay of SAVE_RETRY_DELAYS_MS) {
      expect(coordinator.scheduleRetry('page', onFire)).toBe(true);
      vi.advanceTimersByTime(delay - 1);
      expect(onFire).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onFire).toHaveBeenCalledTimes(1);
      onFire.mockClear();
    }

    expect(coordinator.scheduleRetry('page', onFire)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backoff grows and is capped', () => {
    expect([...SAVE_RETRY_DELAYS_MS]).toEqual([...SAVE_RETRY_DELAYS_MS].sort((a, b) => a - b));
    expect(Math.max(...SAVE_RETRY_DELAYS_MS)).toBeLessThanOrEqual(30_000);
    expect(SAVE_RETRY_DELAYS_MS.length).toBeLessThanOrEqual(8);
  });

  it('a second scheduleRetry replaces the pending one instead of adding a timer', () => {
    const coordinator = new SaveCoordinator();
    const first = vi.fn();
    const second = vi.fn();

    coordinator.scheduleRetry('page', first);
    coordinator.scheduleRetry('page', second);

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keys are independent', () => {
    const coordinator = new SaveCoordinator();
    const a = vi.fn();
    const b = vi.fn();
    coordinator.scheduleRetry('a', a);
    coordinator.resetRetries('b');

    coordinator.scheduleRetry('b', b);
    vi.advanceTimersByTime(SAVE_RETRY_DELAYS_MS[0]!);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('cancelTimers cancels the pending retry and restarts the schedule', () => {
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();
    coordinator.scheduleRetry('page', onFire);
    coordinator.scheduleRetry('page', onFire); // second step is now pending

    coordinator.cancelTimers('page');
    vi.advanceTimersByTime(60_000);
    expect(onFire).not.toHaveBeenCalled();

    coordinator.scheduleRetry('page', onFire);
    vi.advanceTimersByTime(SAVE_RETRY_DELAYS_MS[0]!);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('cancelAllTimers cancels every pending retry', () => {
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();
    coordinator.scheduleRetry('a', onFire);
    coordinator.scheduleRetry('b', onFire);

    coordinator.cancelAllTimers();
    vi.advanceTimersByTime(60_000);

    expect(onFire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new edit cancels the pending retry timer but does not refill the retry budget', () => {
    const coordinator = new SaveCoordinator();
    const retry = vi.fn();
    for (let step = 0; step < SAVE_RETRY_DELAYS_MS.length - 1; step += 1) {
      coordinator.scheduleRetry('page', retry); // all but the last step used; the last one pending
    }
    expect(coordinator.hasPendingRetry('page')).toBe(true);

    coordinator.scheduleSave('page', vi.fn()); // an edit
    expect(coordinator.hasPendingRetry('page')).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(retry).not.toHaveBeenCalled();

    // One step of budget is left (the edit did not restore the others), and then none.
    expect(coordinator.scheduleRetry('page', retry)).toBe(true);
    expect(coordinator.scheduleRetry('page', retry)).toBe(false);
  });

  it('reports a scheduled retry, and exhaustion only once every step is used and none is pending', () => {
    const coordinator = new SaveCoordinator();
    expect(coordinator.retriesExhausted('page')).toBe(false);

    for (const delay of SAVE_RETRY_DELAYS_MS) {
      coordinator.scheduleRetry('page', vi.fn());
      expect(coordinator.hasPendingRetry('page')).toBe(true);
      expect(coordinator.retriesExhausted('page')).toBe(false);
      vi.advanceTimersByTime(delay);
    }

    expect(coordinator.hasPendingRetry('page')).toBe(false);
    expect(coordinator.retriesExhausted('page')).toBe(true);
  });

  it('a confirmed save on a non-session channel (title, description) resets its schedule', () => {
    const coordinator = new SaveCoordinator();
    coordinator.beginChannelSave('page:title', 'x');
    coordinator.scheduleRetry('page:title', vi.fn());

    expect(coordinator.completeChannelSave('page:title', 'x')).toBe(true);

    expect(coordinator.hasPendingRetry('page:title')).toBe(false);
    expect(coordinator.retriesExhausted('page:title')).toBe(false);
  });

  it('a successful save resets the schedule', () => {
    const coordinator = new SaveCoordinator();
    const session = new DocumentSession('page', 'a');
    session.commit(new DocumentTransaction('b'));
    const revision = coordinator.beginSave(session);
    coordinator.scheduleRetry('page', vi.fn());
    coordinator.scheduleRetry('page', vi.fn());

    coordinator.completeSave(session, revision);

    expect(vi.getTimerCount()).toBe(0);
    const onFire = vi.fn();
    coordinator.scheduleRetry('page', onFire);
    vi.advanceTimersByTime(SAVE_RETRY_DELAYS_MS[0]!);
    expect(onFire).toHaveBeenCalledTimes(1);
  });
});
