import { describe, expect, it } from 'vitest';
import { DocumentSession } from './DocumentSession';
import { DocumentState } from './DocumentState';
import { DocumentTransaction } from './DocumentTransaction';

describe('DocumentSession.markDisposed', () => {
  it('transitions a Clean session to Disposed', () => {
    const session = new DocumentSession('page-1', '# Hello');

    expect(session.state).toBe(DocumentState.Clean);

    session.markDisposed();

    expect(session.state).toBe(DocumentState.Disposed);
  });

  it('transitions a Saving session to Disposed', () => {
    const session = new DocumentSession('page-1', '# Hello');

    session.beginSave();
    expect(session.state).toBe(DocumentState.Saving);

    session.markDisposed();

    expect(session.state).toBe(DocumentState.Disposed);
  });

  it('transitions a SaveError session to Disposed', () => {
    const session = new DocumentSession('page-1', '# Hello');

    session.beginSave();
    session.markSaveFailed();
    expect(session.state).toBe(DocumentState.SaveError);

    session.markDisposed();

    expect(session.state).toBe(DocumentState.Disposed);
  });

  it('is idempotent — a second call is a no-op, not an error', () => {
    const session = new DocumentSession('page-1', '# Hello');

    session.markDisposed();
    expect(session.state).toBe(DocumentState.Disposed);

    expect(() => session.markDisposed()).not.toThrow();
    expect(session.state).toBe(DocumentState.Disposed);
  });

  it('notifies subscribers when disposed', () => {
    const session = new DocumentSession('page-1', '# Hello');
    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    session.markDisposed();

    expect(notifications).toBe(1);
  });

  it('does not notify subscribers on a redundant second call', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.markDisposed();

    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    session.markDisposed();

    expect(notifications).toBe(0);
  });

  it('preserves the current revision — disposal never discards content', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Hello, edited'));

    session.markDisposed();

    expect(session.currentRevision.markdown).toBe('# Hello, edited');
  });
});

/**
 * autosave-execution-model.md §1.6: "once Disposed... any pending timer or
 * in-flight-save completion for it must be inert." Found during M4's final
 * audit — a save already in flight when disposal happens can otherwise
 * "resurrect" the session's state once it completes, since none of these
 * four methods checked for Disposed before this fix.
 */
describe('DocumentSession: every state-mutating method is inert once Disposed', () => {
  it('commit() is a no-op after disposal — does not advance the revision or notify', () => {
    const session = new DocumentSession('page-1', '# Hello');
    const revisionBeforeDisposal = session.currentRevision;
    session.markDisposed();

    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    const result = session.commit(new DocumentTransaction('# Late edit, after disposal'));

    expect(session.state).toBe(DocumentState.Disposed);
    expect(session.currentRevision).toBe(revisionBeforeDisposal);
    expect(result).toBe(revisionBeforeDisposal);
    expect(notifications).toBe(0);
  });

  it('beginSave() is a no-op after disposal — does not resurrect Saving', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.markDisposed();

    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    session.beginSave();

    expect(session.state).toBe(DocumentState.Disposed);
    expect(notifications).toBe(0);
  });

  it('markSaved() is a no-op after disposal — a late-arriving successful completion does not resurrect Clean', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.commit(new DocumentTransaction('# Edited before the save started'));
    session.beginSave();
    const inFlightRevision = session.currentRevision;
    const savedRevisionBeforeDisposal = session.savedRevision;

    // The session is disposed while its save is still in flight.
    session.markDisposed();

    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    // The in-flight save's completion arrives after disposal.
    session.markSaved(inFlightRevision);

    expect(session.state).toBe(DocumentState.Disposed);
    expect(session.savedRevision).toBe(savedRevisionBeforeDisposal);
    expect(notifications).toBe(0);
  });

  it('markSaveFailed() is a no-op after disposal — a late-arriving failure does not resurrect SaveError', () => {
    const session = new DocumentSession('page-1', '# Hello');
    session.beginSave();
    session.markDisposed();

    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    session.markSaveFailed();

    expect(session.state).toBe(DocumentState.Disposed);
    expect(notifications).toBe(0);
  });
});
