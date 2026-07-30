import type { Application } from '@core/application/Application';

import { useActivePage } from '@app/hooks/useActivePage';
import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { DailyNotePage } from '@features/daily-notes/page/DailyNotePage';
import { toDailyNotePageModel } from '@features/daily-notes/page/DailyNotePageModel';
import { NotePage } from '@features/notes/page/NotePage';
import { toNotePageModel } from '@features/notes/page/NotePageModel';
import { FolderPage } from '@features/folder/page/FolderPage';
import { toFolderPageModel } from '@features/folder/page/toFolderPageModel';

interface PageHostProps {
  application: Application;
}

/**
 * PageHost is the composition root for page rendering.
 *
 * It resolves the active navigation target, constructs the appropriate ViewModel,
 * and delegates rendering to the correct page component.
 *
 * It intentionally contains no business logic or persistence logic.
 *
 * Page dispatch currently uses a switch statement but is expected to evolve into a registry
 * when multiple page types justify the abstraction.
 */
export function PageHost({ application }: PageHostProps) {
  const workspace = useWorkspace(application.workspace);
  const vault = application.vault;

  const activePageId = workspace.activePageId;
  const activeFolderId = workspace.activeFolderId;
  const page = useActivePage(vault, activePageId);

  const rawSession = activePageId
    ? application.pageService.getSession(activePageId)
    : undefined;

  // React observes DocumentSession changes through this hook.
  // The session remains the single source of editable document state.
  const session = useDocumentSession(rawSession);

  const onOpenFolder = (id: string) => application.folderService.openFolder(id);
  const onUpdateMarkdown = (pageId: string, markdown: string): void => {
    application.pageService.updateMarkdown(pageId, markdown);
  };

  const onArchive = async (): Promise<void> => {
    if (!activePageId) {
      return;
    }

    await application.pageMutationService.archivePage(activePageId);
  };

  if (activeFolderId) {
    const folder = vault.getFolder(activeFolderId);

    if (!folder) {
      throw new Error(`Folder not found: ${activeFolderId}`);
    }

    const model = toFolderPageModel(folder, vault, workspace, {
      onOpenFolder,
      onOpenNote: (id: string) => application.pageService.openPage(id),
    });

    return <FolderPage model={model} />;
  }

  if (!session || !activePageId) {
    return null;
  }

  // Structural presentation (path, parent, breadcrumbs, metadata) must read
  // from the Vault — the live source of truth after moves and archive/restore.
  // DocumentSession owns only the editor buffer and save lifecycle.
  if (!page) {
    throw new Error(`Page not found: ${activePageId}`);
  }

  // TODO: This temporary dispatch will become a registry-backed page renderer once additional page types exist.
  // The current switch is intentionally retained until there are enough concrete implementations to justify the abstraction.
  switch (page.type) {
    case 'note': {
      const model = toNotePageModel(
        page,
        session,
        vault,
        onOpenFolder,
        onUpdateMarkdown
      );
      return <NotePage model={model} onArchive={onArchive} />;
    }

    case 'daily-note': {
      const model = toDailyNotePageModel(page, session, vault, onOpenFolder);
      return <DailyNotePage model={model} />;
    }

    default:
      throw new Error(`Unsupported page type: ${page.type}`);
  }
}
