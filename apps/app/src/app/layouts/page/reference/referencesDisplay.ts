import type { PageReferences } from './getPageReferences';

/** Every reference occurrence the section lists: tasks plus note and daily-note lines. */
export function countPageReferences(references: PageReferences): number {
  return references.tasks.length + references.notes.length + references.dailyNotes.length;
}

/**
 * Whether a note's References section is on screen (ADR-052). `savedHidden` is the user's explicit choice —
 * `true` Hide, `false` Show (which keeps an empty section visible) — and absent means automatic: shown only
 * when there is something to list.
 */
export function isReferencesDisplayed(savedHidden: boolean | undefined, hasReferences: boolean): boolean {
  return savedHidden === undefined ? hasReferences : !savedHidden;
}
