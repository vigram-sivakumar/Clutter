import type { PageReferences } from './getPageReferences';

/** Every reference occurrence the section lists: tasks plus note and daily-note lines. */
export function countPageReferences(references: PageReferences): number {
  return references.tasks.length + references.notes.length + references.dailyNotes.length;
}

/**
 * Whether a note's References section is on screen. The note's own saved choice always wins: an explicit Show
 * (`savedHidden === false`) displays it, even when there is nothing to list, and an explicit Hide (`true`) never does.
 * With no saved choice (`undefined`) it shows only when the Show references automatically setting is on and the note
 * has at least one reference — otherwise it stays hidden (ADR-053; ADR-060 for the setting).
 *
 * `count` is the note's reference count the caller already has (`countPageReferences`); nothing here counts or stores.
 */
export function isReferencesDisplayed(
  savedHidden: boolean | undefined,
  automatic: { readonly enabled: boolean; readonly count: number } = { enabled: false, count: 0 }
): boolean {
  if (savedHidden !== undefined) {
    return savedHidden === false;
  }

  return automatic.enabled && automatic.count > 0;
}
