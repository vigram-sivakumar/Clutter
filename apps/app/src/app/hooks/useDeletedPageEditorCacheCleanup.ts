import { useEffect } from 'react';

import type { Application } from '@core/application/Application';
import { clearCachedEditorSession } from '@features/markdown/editor/codemirror/editorHistoryCache';

/**
 * Drops the editor's in-memory session (undo history and scroll position, `editorHistoryCache.ts`) of every page
 * that was permanently deleted, whichever way it went: a single note, a folder's whole subtree, Empty archive or the
 * automatic cleanup. The Application announces them only after the delete succeeded, and only for pages that were
 * really deleted, so an archive, a restore, a refused delete or an abandoned one never clears anything.
 *
 * Best effort, as `clearCachedEditorSession` documents: an editor that is still mounted can write its entry back as
 * it unmounts, which can only make this a no-op.
 */
export function useDeletedPageEditorCacheCleanup(application: Application): void {
  useEffect(
    () =>
      application.subscribePagesPermanentlyDeleted((pageIds) => {
        for (const pageId of pageIds) {
          clearCachedEditorSession(pageId, application);
        }
      }),
    [application]
  );
}
