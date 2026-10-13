import type { PageReferences } from './getPageReferences';

/** Every reference occurrence the section lists: tasks plus note and daily-note lines. */
export function countPageReferences(references: PageReferences): number {
  return references.tasks.length + references.notes.length + references.dailyNotes.length;
}

/**
 * Whether a note's References section is on screen (ADR-052, amended by ADR-053). Hidden by default: only the
 * user's explicit Show (`savedHidden === false`) displays it, even when there is nothing to list.
 */
export function isReferencesDisplayed(savedHidden: boolean | undefined): boolean {
  return savedHidden === false;
}
