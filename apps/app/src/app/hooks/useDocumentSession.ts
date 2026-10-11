import { useCallback, useSyncExternalStore } from 'react';
import { DocumentSession } from '@core/engine/DocumentSession';

/**
 * React adapter for DocumentSession.
 *
 * This hook observes session changes while keeping DocumentSession framework-agnostic.
 * React observes editing state rather than owning it.
 *
 * Built on `useSyncExternalStore`, not `useState` + an effect, on purpose: a store change is rendered
 * synchronously (flushed in a microtask), so the `markdown` prop that PageHost reads from the session is
 * already in the editor before the next input event can run. A `useState` update from a non-React task is
 * rendered in a later task, and a keystroke landing in that gap would be made from text the session has
 * already moved past. The snapshot is derived from the session itself (revision, lifecycle state, saved
 * revision), so a change made before the subscription is established is still seen.
 */
export function useDocumentSession(
  session: DocumentSession | undefined
): DocumentSession | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => (session ? session.subscribe(onChange) : () => {}),
    [session]
  );
  const getSnapshot = (): string =>
    session
      ? `${session.revisionNumber}:${session.state}:${session.savedRevision.number}`
      : '';

  useSyncExternalStore(subscribe, getSnapshot);

  return session;
}
