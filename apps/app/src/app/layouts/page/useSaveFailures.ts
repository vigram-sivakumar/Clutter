import { useSyncExternalStore } from 'react';
import type { SaveFailureStatus } from '@core/application/page/PageOperations';

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
 * The save-failure state for every open page.
 *
 * PageOperations owns the state (a page stays in a failure streak until its changes are confirmed saved, through each
 * retry), so this only reads it. There is deliberately no toast: the persistent top bar notice is the one signal, so
 * the same failure is never announced twice.
 */
export function useSaveFailures(source: SaveFailureSource): SaveFailures {
  useSyncExternalStore(source.subscribeSaveFailures.bind(source), () => source.saveFailureSnapshot());
  const failedIds = source.failedSavePageIds();

  return { statusOf: (pageId) => source.saveFailureStatus(pageId), failedIds };
}
