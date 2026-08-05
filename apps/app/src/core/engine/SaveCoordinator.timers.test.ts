import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTOSAVE_CEILING_MS,
  AUTOSAVE_DEBOUNCE_MS,
  SaveCoordinator,
} from './SaveCoordinator';
import { DocumentSession } from './DocumentSession';
import { DocumentTransaction } from './DocumentTransaction';
import { DocumentState } from './DocumentState';

describe('SaveCoordinator: timer lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a single scheduleSave() call arms a debounce timer that fires onFire after the debounce interval', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Edited'));
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();

    coordinator.scheduleSave(session.id, onFire);

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('a second scheduleSave() call before the debounce interval elapses resets the timer', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Edit 1'));
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();

    coordinator.scheduleSave(session.id, onFire);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 500);

    session.commit(new DocumentTransaction('# Edit 2'));
    coordinator.scheduleSave(session.id, onFire);

    // Advancing to just past the *original* deadline must not fire it —
    // the timer was reset.
    vi.advanceTimersByTime(500);
    expect(onFire).not.toHaveBeenCalled();

    // Advancing past the *new* deadline does fire it.
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 500);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('the ceiling timer fires even under continuous re-committing that keeps resetting the debounce timer', () => {
    const session = new DocumentSession('page-1', '# Hello');
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();
    const commitInterval = 500;
    let content = 0;

    session.commit(new DocumentTransaction(`# Edit ${content}`));
    coordinator.scheduleSave(session.id, onFire);

    // Keep committing faster than the debounce interval, for longer than
    // the ceiling — the debounce timer never gets a chance to fire on its
    // own, but the ceiling must still fire.
    const totalSteps = Math.ceil(AUTOSAVE_CEILING_MS / commitInterval) + 2;
    for (let i = 0; i < totalSteps; i++) {
      vi.advanceTimersByTime(commitInterval);
      content += 1;
      session.commit(new DocumentTransaction(`# Edit ${content}`));
      coordinator.scheduleSave(session.id, onFire);
    }

    expect(onFire).toHaveBeenCalled();
  });

  it('does not re-arm the ceiling timer while one is already pending', () => {
    const session = new DocumentSession('page-1', '# Hello');
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();

    session.commit(new DocumentTransaction('# Edit 1'));
    coordinator.scheduleSave(session.id, onFire);

    // A second commit shortly after should not push the ceiling out —
    // advancing to just past the *original* ceiling deadline should still
    // fire it (proving the ceiling wasn't reset by the second commit).
    vi.advanceTimersByTime(100);
    session.commit(new DocumentTransaction('# Edit 2'));
    coordinator.scheduleSave(session.id, onFire);

    vi.advanceTimersByTime(AUTOSAVE_CEILING_MS - 100);
    expect(onFire).toHaveBeenCalled();
  });

  it('completeSave() cancels both timers once the session is caught up — no stray fire afterward', () => {
    const session = new DocumentSession('page-1', '# Hello');
    const revision = session.commit(new DocumentTransaction('# Edited'));
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();

    coordinator.beginSave(session);
    coordinator.scheduleSave(session.id, onFire);
    coordinator.completeSave(session, revision);

    expect(session.state).toBe(DocumentState.Clean);
    expect(session.isDirty).toBe(false);

    vi.advanceTimersByTime(AUTOSAVE_CEILING_MS + AUTOSAVE_DEBOUNCE_MS);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('completeSave() leaves timers armed if the session is still dirty (a restart is pending)', () => {
    const session = new DocumentSession('page-1', '# Hello');
    const firstRevision = session.commit(new DocumentTransaction('# Edit 1'));
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();

    coordinator.beginSave(session);
    coordinator.scheduleSave(session.id, onFire);
    // More content commits while the save is "in flight" (simulated —
    // this test exercises SaveCoordinator/DocumentSession directly, not
    // the full PageOperations.requestSave() loop, which M4 already covers).
    session.commit(new DocumentTransaction('# Edit 2, during save'));
    coordinator.completeSave(session, firstRevision);

    expect(session.isDirty).toBe(true);

    // The debounce timer (armed above) must still be live.
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('cancelTimers() clears both timers for a session, unconditionally', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Edited'));
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();

    coordinator.scheduleSave(session.id, onFire);
    coordinator.cancelTimers(session.id);

    vi.advanceTimersByTime(AUTOSAVE_CEILING_MS + AUTOSAVE_DEBOUNCE_MS);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('cancelTimers() on an id with no armed timers is a harmless no-op', () => {
    const coordinator = new SaveCoordinator();

    expect(() => coordinator.cancelTimers('no-such-session')).not.toThrow();
  });

  it('cancelAllTimers() clears every session’s timers at once', () => {
    const sessionA = new DocumentSession('page-a', '# A');
    const sessionB = new DocumentSession('page-b', '# B');
    sessionA.commit(new DocumentTransaction('# A edited'));
    sessionB.commit(new DocumentTransaction('# B edited'));
    const coordinator = new SaveCoordinator();
    const onFireA = vi.fn();
    const onFireB = vi.fn();

    coordinator.scheduleSave(sessionA.id, onFireA);
    coordinator.scheduleSave(sessionB.id, onFireB);

    coordinator.cancelAllTimers();

    vi.advanceTimersByTime(AUTOSAVE_CEILING_MS + AUTOSAVE_DEBOUNCE_MS);
    expect(onFireA).not.toHaveBeenCalled();
    expect(onFireB).not.toHaveBeenCalled();
  });

  it('a channel key with its own debounce/ceiling is independent of the body defaults (title-vs-body cadence)', () => {
    const coordinator = new SaveCoordinator();
    const onFire = vi.fn();
    const titleDebounceMs = AUTOSAVE_DEBOUNCE_MS * 3;

    coordinator.scheduleSave('page-1:title', onFire, {
      debounceMs: titleDebounceMs,
      ceilingMs: AUTOSAVE_CEILING_MS * 3,
    });

    // The body's own (shorter) debounce interval elapses — the title
    // channel, scheduled with a longer one, must not have fired yet.
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(titleDebounceMs - AUTOSAVE_DEBOUNCE_MS);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('a body-channel timer firing does not fire an independently-keyed title-channel timer for the same page', () => {
    const coordinator = new SaveCoordinator();
    const bodyOnFire = vi.fn();
    const titleOnFire = vi.fn();

    coordinator.scheduleSave('page-1', bodyOnFire);
    coordinator.scheduleSave('page-1:title', titleOnFire, { debounceMs: AUTOSAVE_DEBOUNCE_MS * 10 });

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(bodyOnFire).toHaveBeenCalledTimes(1);
    expect(titleOnFire).not.toHaveBeenCalled();
  });

  it('cancelTimers() on a channel key only clears that channel, leaving a same-page different-channel key untouched', () => {
    const coordinator = new SaveCoordinator();
    const bodyOnFire = vi.fn();
    const titleOnFire = vi.fn();

    coordinator.scheduleSave('page-1', bodyOnFire);
    coordinator.scheduleSave('page-1:title', titleOnFire);

    coordinator.cancelTimers('page-1:title');

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(bodyOnFire).toHaveBeenCalledTimes(1);
    expect(titleOnFire).not.toHaveBeenCalled();
  });

  it('multiple sessions have fully independent timers', () => {
    const sessionA = new DocumentSession('page-a', '# A');
    const sessionB = new DocumentSession('page-b', '# B');
    sessionA.commit(new DocumentTransaction('# A edited'));
    const coordinator = new SaveCoordinator();
    const onFireA = vi.fn();
    const onFireB = vi.fn();

    coordinator.scheduleSave(sessionA.id, onFireA);

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(onFireA).toHaveBeenCalledTimes(1);
    expect(onFireB).not.toHaveBeenCalled();

    sessionB.commit(new DocumentTransaction('# B edited'));
    coordinator.scheduleSave(sessionB.id, onFireB);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(onFireB).toHaveBeenCalledTimes(1);
  });
});
