import type { CompletionSection } from '@codemirror/autocomplete';

import { COMPLETION_SECTIONS } from './completionSections';

/**
 * The two families a typed `[[` / `![[` result can hold: things opened as notes (notes, Daily Notes, templates,
 * folders) and files (images, PDFs). A trigger maps each of its suggestions to one — or to none, for a row that
 * stands alone (Create) — and the grouping below is the same for every trigger.
 */
export type TargetFamily = 'notes' | 'assets';

/**
 * The section a row belongs to when a result holds BOTH families, else `undefined` (one family, or none: a plain
 * continuous list needs no headers). One implementation for every trigger.
 */
export function mixedGroupSections(
  families: readonly (TargetFamily | undefined)[]
): readonly (CompletionSection | undefined)[] {
  const mixed = families.includes('notes') && families.includes('assets');

  return families.map((family) =>
    !mixed || family === undefined
      ? undefined
      : family === 'assets'
        ? COMPLETION_SECTIONS.linkAssets
        : COMPLETION_SECTIONS.linkNotesAndFolders
  );
}
