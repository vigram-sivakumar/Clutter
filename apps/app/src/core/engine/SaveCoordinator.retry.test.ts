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

  it('a new edit (scheduleSave) supersedes a pending retry and restarts the schedule', () => {
    const coordinator = new SaveCoordinator();
    const retry = vi.fn();
    coordinator.scheduleRetry('page', retry);
    coordinator.scheduleRetry('page', retry);

    coordinator.scheduleSave('page', vi.fn());
    vi.advanceTimersByTime(60_000);
    expect(retry).not.toHaveBeenCalled();

    coordinator.cancelTimers('page');
    coordinator.scheduleRetry('page', retry);
    vi.advanceTimersByTime(SAVE_RETRY_DELAYS_MS[0]!);
    expect(retry).toHaveBeenCalledTimes(1);
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
