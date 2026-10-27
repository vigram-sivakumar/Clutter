import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { SaveFailureStatus } from '@core/application/page/PageOperations';
import { useToast } from '@components/toast/ToastProvider';

/** The part of PageOperations this hook reads. */
export interface SaveFailureSource {
  saveFailureSnapshot(): string;
  subscribeSaveFailures(listener: () => void): () => void;
  failedSavePageIds(): readonly string[];
  saveFailureStatus(pageId: string): SaveFailureStatus | null;
}

export interface SaveFailures {
  /** The failure status of one page, or null when its last save did not fail (or it has been saved since). */
  readonly statusOf: (pageId: string) => SaveFailureStatus | null;
  /** Every page with an unresolved save failure, whether or not it is the one on screen. */
  readonly failedIds: readonly string[];
}

/**
 * The save-failure state for every open page, and one toast when a page starts failing.
 *
 * PageOperations owns the state (a page stays in a failure streak until its changes are confirmed saved, through each
 * retry), so this only reads it. The toast fires once per streak: a page that is already failing does not toast again
 * when a retry fails, and it can toast again only after a save has succeeded and a later one fails.
 */
export function useSaveFailures(source: SaveFailureSource): SaveFailures {
  const toast = useToast();
  useSyncExternalStore(source.subscribeSaveFailures.bind(source), () => source.saveFailureSnapshot());
  const failedIds = source.failedSavePageIds();
  const notifiedRef = useRef<Set<string>>(new Set());
  const failedKey = failedIds.join('\n');

  useEffect(() => {
    const ids = failedKey === '' ? [] : failedKey.split('\n');
    const notified = notifiedRef.current;
    const fresh = ids.filter((id) => !notified.has(id));

    for (const id of [...notified]) {
      if (!ids.includes(id)) notified.delete(id);
    }
    for (const id of fresh) notified.add(id);
    if (fresh.length > 0) {
      toast.fail('Couldn’t save changes');
    }
  }, [failedKey, toast]);

  return { statusOf: (pageId) => source.saveFailureStatus(pageId), failedIds };
}
