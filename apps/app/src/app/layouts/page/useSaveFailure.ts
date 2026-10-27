import { useEffect, useRef, useState } from 'react';
import { DocumentState } from '@core/engine/DocumentState';
import type { DocumentSession } from '@core/engine/DocumentSession';
import { useToast } from '@components/toast/ToastProvider';

/**
 * Whether the open document is in an unresolved save failure, and the one-time toast that announces it.
 *
 * A failure *streak* starts when the session enters SaveError and ends only when the document is clean again:
 * every revision saved. Automatic retries move the session SaveError → Saving → SaveError over and over; those
 * are not new events, so
 *  - the returned flag stays true through each retry's Saving phase (the top-bar notice does not flicker off
 *    while the unsaved changes are still unsaved), and
 *  - the toast fires once per streak, not once per attempt.
 * A later successful save leaves the streak, which clears the flag and re-arms the toast for the next one.
 */
export function useSaveFailure(session: DocumentSession | undefined): boolean {
  const toast = useToast();
  const [streak, setStreak] = useState<DocumentSession | null>(null);
  const toastedRef = useRef<DocumentSession | null>(null);
  const state = session?.state;
  const isDirty = session?.isDirty ?? false;

  useEffect(() => {
    if (!session) {
      toastedRef.current = null;
      setStreak(null);
      return;
    }

    if (state === DocumentState.SaveError) {
      setStreak(session);
      if (toastedRef.current !== session) {
        toastedRef.current = session;
        toast.fail('Couldn’t save changes. Clutter will try again');
      }
      return;
    }

    if (!isDirty) {
      toastedRef.current = null;
      setStreak(null);
    }
  }, [session, state, isDirty, toast]);

  return state === DocumentState.SaveError || (streak !== null && streak === session && isDirty);
}
