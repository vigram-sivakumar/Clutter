/**
 * What a named `CollectionBehavior` DOES. The definitions only name a behavior; the logic
 * lives here, outside the declarative data (a definition never carries a function).
 */
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';

import type { CollectionBehavior } from './collectionDefinitions';

/**
 * The order a behavior draws its folders in, as a comparison of two folder NAMES — or
 * `undefined` for a collection whose folders follow the Configure sort. The Daily Notes root
 * lists years latest first, a year lists its months January to December.
 */
export function foldersOrderOf(behavior: CollectionBehavior | undefined): ((a: string, b: string) => number) | undefined {
  switch (behavior) {
    case 'daily-notes-root':
      return (a, b) => DailyNotePath.compareFolderNames('root', a, b);
    case 'daily-notes-year':
      return (a, b) => DailyNotePath.compareFolderNames('year', a, b);
    default:
      return undefined;
  }
}

/** Whether the collection draws its folders section: not when it lists only its notes (`notes-only`). */
export function showsFolders(behavior: CollectionBehavior | undefined): boolean {
  return behavior !== 'notes-only';
}

/** Whether the collection draws its notes section: the Daily Notes root and a year hold only folders. */
export function showsNotes(behavior: CollectionBehavior | undefined): boolean {
  return behavior !== 'daily-notes-root' && behavior !== 'daily-notes-year';
}
