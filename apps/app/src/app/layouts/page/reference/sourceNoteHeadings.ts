import { VaultPath } from '@core/vault/ingest/VaultPath';
import type { Page } from '@core/vault/models/Page';
import {
  getPageDisplayLabel,
  toPageDisplayLabelInput,
} from '@core/presentation/getPageDisplayLabel';

/** Between the folders, and between the folder and the title, of a heading that needs folder context. */
export const FOLDER_SEPARATOR = ' / ';

/**
 * The heading text for each source note in a References section, by page id. A title that no other source note
 * shares is shown alone. Notes with the same title are told apart by their immediate parent folder
 * (`Folder / Title`); a note directly in the vault root keeps just its title, and the root's name is never shown.
 * Only when two notes share both title and immediate parent folder does the full folder path stand in for the
 * parent.
 *
 * Identity is the page id throughout — a rename or a move changes the text, never which note is which.
 */
export function getSourceNoteHeadings(
  pages: readonly Page[],
  vaultRoot: string
): Map<string, string> {
  const byTitle = new Map<
    string,
    { id: string; folderPath: string; parent: string }[]
  >();

  for (const page of pages) {
    const title = getPageDisplayLabel(toPageDisplayLabelInput(page)).text;
    const folderPath = VaultPath.parentDirectory(
      VaultPath.relativeTo(page.path, vaultRoot)
    );
    const sameTitle = byTitle.get(title) ?? [];

    if (!sameTitle.some((note) => note.id === page.id)) {
      sameTitle.push({
        id: page.id,
        folderPath,
        parent: VaultPath.filename(folderPath),
      });
    }

    byTitle.set(title, sameTitle);
  }

  const headings = new Map<string, string>();

  for (const [title, notes] of byTitle) {
    for (const note of notes) {
      const parentIsShared =
        note.parent !== '' &&
        notes.filter((other) => other.parent === note.parent).length > 1;
      const context = parentIsShared
        ? note.folderPath.split('/').join(FOLDER_SEPARATOR)
        : note.parent;

      headings.set(
        note.id,
        notes.length === 1 || context === ''
          ? title
          : `${context}${FOLDER_SEPARATOR}${title}`
      );
    }
  }

  return headings;
}
