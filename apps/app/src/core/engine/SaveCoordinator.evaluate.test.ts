import { describe, expect, it } from 'vitest';
import { SaveCoordinator } from './SaveCoordinator';
import { DocumentSession } from './DocumentSession';
import { DocumentState } from './DocumentState';
import { DocumentTransaction } from './DocumentTransaction';

/**
 * One test per row of autosave-execution-model.md §4.1's coalescing table.
 * Reachable rows are driven through DocumentSession's real public API
 * (commit/beginSave/markSaved/markSaveFailed/markDisposed) rather than
 * constructed directly, so these tests exercise the actual state machine,
 * not a stand-in for it.
 */
describe('SaveCoordinator.evaluate', () => {
  it('Clean + not dirty -> suppress', () => {
    const session = new DocumentSession('page-1', '# Hello');
    const coordinator = new SaveCoordinator();

    expect(session.state).toBe(DocumentState.Clean);
    expect(session.isDirty).toBe(false);
    expect(coordinator.evaluate(session.state, session.isDirty)).toBe('suppress');
  });

  it('Clean + dirty -> execute', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Hello, edited'));
    const coordinator = new SaveCoordinator();

    expect(session.state).toBe(DocumentState.Clean);
    expect(session.isDirty).toBe(true);
    expect(coordinator.evaluate(session.state, session.isDirty)).toBe('execute');
  });

  it('SaveError + dirty -> execute (this is SaveError\'s only exit)', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Hello, edited'));
    session.beginSave();
    session.markSaveFailed();
    const coordinator = new SaveCoordinator();

    expect(session.state).toBe(DocumentState.SaveError);
    expect(session.isDirty).toBe(true);
    expect(coordinator.evaluate(session.state, session.isDirty)).toBe('execute');
  });

  it('Saving + not dirty -> suppress (a save for this exact content is already in flight)', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.beginSave();
    const coordinator = new SaveCoordinator();

    expect(session.state).toBe(DocumentState.Saving);
    expect(session.isDirty).toBe(false);
    expect(coordinator.evaluate(session.state, session.isDirty)).toBe('suppress');
  });

  it('Saving + dirty -> suppress (the "defer" row — restart is realized on completion, not here)', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# First edit'));
    session.beginSave();
    // More typing arrives while the save above is still in flight.
    session.commit(new DocumentTransaction('# Second edit, during save'));
    const coordinator = new SaveCoordinator();

    expect(session.state).toBe(DocumentState.Saving);
    expect(session.isDirty).toBe(true);
    expect(coordinator.evaluate(session.state, session.isDirty)).toBe('suppress');
  });

  it('Disposed + dirty -> suppress, unconditionally', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Hello, edited'));
    session.markDisposed();
    const coordinator = new SaveCoordinator();

    expect(session.state).toBe(DocumentState.Disposed);
    expect(session.isDirty).toBe(true);
    expect(coordinator.evaluate(session.state, session.isDirty)).toBe('suppress');
  });

  it('Disposed + not dirty -> suppress, unconditionally', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.markDisposed();
    const coordinator = new SaveCoordinator();

    expect(session.state).toBe(DocumentState.Disposed);
    expect(session.isDirty).toBe(false);
    expect(coordinator.evaluate(session.state, session.isDirty)).toBe('suppress');
  });

  /**
   * The remaining three rows (SaveError + not dirty, Conflict, Loading) are
   * named in §4.1's table as "unreachable in practice" — no public
   * DocumentSession API path produces them (SaveError only follows a failed
   * save on dirty content; Conflict has no producer anywhere in the
   * codebase, reserved for a future Sync feature; Loading is bypassed by
   * the constructor, which sets Clean immediately). Tested here directly
   * against evaluate()'s now-explicit (state, isDirty) inputs — no fake
   * DocumentSession needed since evaluate() no longer takes one — purely
   * to confirm evaluate()'s switch is exhaustive and defensively correct,
   * not because any real trigger can produce them.
   */
  it('SaveError + not dirty -> suppress (unreachable in practice; exhaustiveness check)', () => {
    const coordinator = new SaveCoordinator();

    expect(coordinator.evaluate(DocumentState.SaveError, false)).toBe('suppress');
  });

  it('Conflict -> suppress regardless of dirty (out of scope for autosave; exhaustiveness check)', () => {
    const coordinator = new SaveCoordinator();

    expect(coordinator.evaluate(DocumentState.Conflict, true)).toBe('suppress');
    expect(coordinator.evaluate(DocumentState.Conflict, false)).toBe('suppress');
  });

  it('Loading -> suppress regardless of dirty (unreachable in practice; exhaustiveness check)', () => {
    const coordinator = new SaveCoordinator();

    expect(coordinator.evaluate(DocumentState.Loading, true)).toBe('suppress');
    expect(coordinator.evaluate(DocumentState.Loading, false)).toBe('suppress');
  });

  it('is a pure query — calling it repeatedly does not change the outcome or mutate the session', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Hello, edited'));
    const coordinator = new SaveCoordinator();

    const first = coordinator.evaluate(session.state, session.isDirty);
    const second = coordinator.evaluate(session.state, session.isDirty);
    const third = coordinator.evaluate(session.state, session.isDirty);

    expect([first, second, third]).toEqual(['execute', 'execute', 'execute']);
    expect(session.state).toBe(DocumentState.Clean);
    expect(session.isDirty).toBe(true);
  });
});

describe('SaveCoordinator channel generalization (title and future non-body channels)', () => {
  it('scheduleSave() accepts a plain string channel key, independent of any DocumentSession', () => {
    const coordinator = new SaveCoordinator();
    const onFire = () => {};

    expect(() => coordinator.scheduleSave('page-1:title', onFire)).not.toThrow();
  });

  it('beginChannelSave/completeChannelSave: a completion matching the tracked in-flight value succeeds and clears it', () => {
    const coordinator = new SaveCoordinator();

    coordinator.beginChannelSave('page-1:title', 'Renamed');

    expect(coordinator.completeChannelSave('page-1:title', 'Renamed')).toBe(true);
    // Cleared — a second completion for the same (now-stale) value no longer matches.
    expect(coordinator.completeChannelSave('page-1:title', 'Renamed')).toBe(false);
  });

  it('completeChannelSave: a stale completion (superseded by a newer in-flight value) is rejected', () => {
    const coordinator = new SaveCoordinator();

    coordinator.beginChannelSave('page-1:title', 'First');
    coordinator.beginChannelSave('page-1:title', 'Second'); // supersedes the first

    expect(coordinator.completeChannelSave('page-1:title', 'First')).toBe(false);
    expect(coordinator.completeChannelSave('page-1:title', 'Second')).toBe(true);
  });

  it('failChannelSave: same stale-guard shape as completeChannelSave', () => {
    const coordinator = new SaveCoordinator();

    coordinator.beginChannelSave('page-1:title', 'Renamed');

    expect(coordinator.failChannelSave('page-1:title', 'something else')).toBe(false);
    expect(coordinator.failChannelSave('page-1:title', 'Renamed')).toBe(true);
  });

  it('different channel keys for the same page never collide, even with equal-looking values', () => {
    const coordinator = new SaveCoordinator();

    coordinator.beginChannelSave('page-1:title', 'shared-value');

    // A different channel key for a value that happens to be identical is
    // not the same in-flight save.
    expect(coordinator.completeChannelSave('page-1:description', 'shared-value')).toBe(false);
    expect(coordinator.completeChannelSave('page-1:title', 'shared-value')).toBe(true);
  });

});

describe('SaveCoordinator.rejectSaveRequest', () => {
  it('transitions to SaveError unconditionally, with no in-flight revision required', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Hello, edited'));
    const coordinator = new SaveCoordinator();

    // No beginSave() was ever called — this session never entered Saving,
    // so there is no activeSaves entry to guard against. Confirms
    // rejectSaveRequest() doesn't rely on failSave()'s stale-revision
    // guard, which would silently no-op here (see PageOperations.ts's
    // requestSave() catch block for why this distinction matters).
    expect(session.state).toBe(DocumentState.Clean);

    coordinator.rejectSaveRequest(session);

    expect(session.state).toBe(DocumentState.SaveError);
  });
});
