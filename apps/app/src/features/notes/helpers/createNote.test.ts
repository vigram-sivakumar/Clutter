import { describe, expect, it, vi } from 'vitest';

import { createNote } from './createNote';
import { buildNotesShortcutHandler } from '../shortcuts/buildNotesShortcutHandler';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';

function fakes() {
  const ensureReservedFolder = vi.fn().mockResolvedValue({ id: 'inbox-id' });
  const openDraft = vi.fn().mockResolvedValue('draft-id');
  return {
    ensureReservedFolder,
    openDraft,
    folderOperations: { ensureReservedFolder } as unknown as FolderOperations,
    pageOperations: { openDraft } as unknown as PageOperations,
  };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createNote', () => {
  it('creates in Inbox when there is no default location', async () => {
    const { folderOperations, pageOperations, ensureReservedFolder, openDraft } = fakes();

    await createNote(folderOperations, pageOperations);

    expect(ensureReservedFolder).toHaveBeenCalledWith('inbox');
    expect(openDraft).toHaveBeenCalledWith({ folderId: 'inbox-id' });
  });

  it('creates in the default folder, without touching Inbox, when there is one', async () => {
    const { folderOperations, pageOperations, ensureReservedFolder, openDraft } = fakes();

    await createNote(folderOperations, pageOperations, 'projects');

    expect(ensureReservedFolder).not.toHaveBeenCalled();
    expect(openDraft).toHaveBeenCalledWith({ folderId: 'projects' });
  });
});

describe("the notes shortcut handler's 'new-note'", () => {
  const navigation = {} as NavigationRouter;

  it('creates in the default location, read when the shortcut runs', async () => {
    const { folderOperations, pageOperations, openDraft } = fakes();
    let defaultFolder: string | undefined;
    const handler = buildNotesShortcutHandler(navigation, pageOperations, folderOperations, () => defaultFolder);

    handler('new-note');
    await flush();
    expect(openDraft).toHaveBeenLastCalledWith({ folderId: 'inbox-id' });

    defaultFolder = 'projects';
    handler('new-note');
    await flush();
    expect(openDraft).toHaveBeenLastCalledWith({ folderId: 'projects' });
  });

  it('still creates in Inbox when no default location is supplied', async () => {
    const { folderOperations, pageOperations, openDraft } = fakes();

    buildNotesShortcutHandler(navigation, pageOperations, folderOperations)('new-note');
    await flush();

    expect(openDraft).toHaveBeenCalledWith({ folderId: 'inbox-id' });
  });
});
