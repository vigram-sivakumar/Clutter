// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DocumentSession } from '@core/engine/DocumentSession';
import { DocumentTransaction } from '@core/engine/DocumentTransaction';

import { useDocumentSession } from './useDocumentSession';

afterEach(() => {
  cleanup();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/** Reads the session at render, the way PageHost reads `session.currentRevision.markdown`. */
function Probe({
  session,
  renders,
}: {
  session: DocumentSession | undefined;
  renders: string[];
}) {
  const live = useDocumentSession(session);
  renders.push(live?.currentRevision.markdown ?? '(none)');
  return <div data-testid="text">{live?.currentRevision.markdown ?? ''}</div>;
}

const text = () => document.querySelector('[data-testid="text"]')!.textContent;
const microtasks = async (n = 20) => {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
};
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('useDocumentSession', () => {
  it('renders a session change made outside React before any later task can run (no act: the real scheduler)', async () => {
    const session = new DocumentSession('a', 'Alpha');
    const renders: string[] = [];
    render(<Probe session={session} renders={renders} />);
    // From here the real scheduler decides when renders happen.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

    // A write arriving from a promise continuation, as PageOperations.mutateBody's does.
    await Promise.resolve();
    session.commit(new DocumentTransaction('Alpha [ext]'));
    await microtasks();

    // Microtasks only — no timer, no macrotask has run: an input event queued behind this point would already
    // find the new text rendered.
    expect(text()).toBe('Alpha [ext]');
  });

  it('renders once per distinct change and not for a notification that changed nothing observable', async () => {
    const session = new DocumentSession('a', 'Alpha');
    const renders: string[] = [];
    render(<Probe session={session} renders={renders} />);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    const before = renders.length;

    session.commit(new DocumentTransaction('Alpha!'));
    await microtasks();
    expect(renders.length - before).toBe(1);

    // Same content: DocumentSession.commit() is a no-op and does not notify.
    session.commit(new DocumentTransaction('Alpha!'));
    await microtasks();
    expect(renders.length - before).toBe(1);
  });

  it('follows lifecycle changes (saving, saved) as well as content', async () => {
    const session = new DocumentSession('a', 'Alpha');
    const renders: string[] = [];
    render(<Probe session={session} renders={renders} />);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    const before = renders.length;

    const revision = session.commit(new DocumentTransaction('Alpha!'));
    session.beginSave();
    await microtasks();
    session.markSaved(revision);
    await microtasks();

    expect(renders.length - before).toBeGreaterThanOrEqual(2);
    expect(text()).toBe('Alpha!');
  });

  it('sees a change made between render and subscription (the snapshot is read from the session)', async () => {
    const session = new DocumentSession('a', 'Alpha');
    const renders: string[] = [];
    // Commit inside the render that is about to subscribe, before the subscription exists.
    function Early() {
      const live = useDocumentSession(session);
      if (live && live.currentRevision.markdown === 'Alpha') {
        live.commit(new DocumentTransaction('Alpha [early]'));
      }
      renders.push(live!.currentRevision.markdown);
      return <div data-testid="text">{live!.currentRevision.markdown}</div>;
    }

    await act(async () => {
      render(<Early />);
    });

    expect(text()).toBe('Alpha [early]');
  });

  it('switches sessions: follows the new one and stops following the old one', async () => {
    const a = new DocumentSession('a', 'Alpha');
    const b = new DocumentSession('b', 'Beta');
    const renders: string[] = [];
    const { rerender } = render(<Probe session={a} renders={renders} />);
    rerender(<Probe session={b} renders={renders} />);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    const before = renders.length;

    a.commit(new DocumentTransaction('Alpha (hidden)'));
    await microtasks();
    await nextTask();
    expect(renders.length).toBe(before);

    b.commit(new DocumentTransaction('Beta!'));
    await microtasks();
    expect(text()).toBe('Beta!');
  });

  it('unsubscribes on unmount and tolerates no session', async () => {
    const session = new DocumentSession('a', 'Alpha');
    const renders: string[] = [];
    const { unmount } = render(<Probe session={session} renders={renders} />);
    unmount();
    const before = renders.length;

    session.commit(new DocumentTransaction('Alpha!'));
    await microtasks();
    expect(renders.length).toBe(before);

    cleanup();
    render(<Probe session={undefined} renders={renders} />);
    expect(text()).toBe('');
  });
});
