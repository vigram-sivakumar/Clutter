import type { Application } from '@core/application/Application';

import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { DailyNotePage } from '@features/daily-notes/page/DailyNotePage';
import { toDailyNotePageModel } from '@features/daily-notes/page/DailyNotePageModel';
import { NotePage } from '@features/notes/page/note/NotePage';
import { toNotePageModel } from '@features/notes/page/note/NotePageModel';
import { FolderPage } from '@features/notes/page/folder/FolderPage';
import { toFolderPageModel } from '@features/notes/page/folder/toFolderPageModel';

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

  const activePageId = workspace.activePageId;
  const activeFolderId = workspace.activeFolderId;

  const onOpenFolder = (id: string) => application.folderService.openFolder(id);

  if (activeFolderId) {
    const folder = application.vault.getFolder(activeFolderId);

    if (!folder) {
      throw new Error(`Folder not found: ${activeFolderId}`);
    }

    const model = toFolderPageModel(folder, application.vault, {
      onOpenFolder,
      onOpenNote: (id) => application.pageService.openPage(id),
    });

    return <FolderPage model={model} />;
  }

  // PageHost always renders from a DocumentSession rather than directly from the Vault.
  // The session is the mutable editing model while the Vault remains the immutable snapshot.
  // Future React subscriptions should observe DocumentSession changes rather than bypassing the session.
  const rawSession = activePageId
    ? application.pageService.getSession(activePageId)
    : undefined;

  // React observes DocumentSession changes through this hook.
  // The session remains the single source of editable document state.
  const session = useDocumentSession(rawSession);

  if (!session) {
    return null;
  }

  // TODO: This temporary dispatch will become a registry-backed page renderer once additional page types exist.
  // The current switch is intentionally retained until there are enough concrete implementations to justify the abstraction.
  switch (session.page.type) {
    case 'note': {
      const model = toNotePageModel(
        session.page,
        session,
        application.vault,
        onOpenFolder
      );
      return <NotePage model={model} />;
    }

    case 'daily-note': {
      const model = toDailyNotePageModel(
        session.page,
        session,
        application.vault,
        onOpenFolder
      );
      return <DailyNotePage model={model} />;
    }

    default:
      throw new Error(`Unsupported page type: ${session.page.type}`);
  }
}
