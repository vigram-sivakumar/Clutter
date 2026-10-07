import type { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import { collectionViewKeyForTag } from '@core/application/collection/collectionViewKey';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';
import type { TagOperations } from '@core/application/tags/TagOperations';
import { formatTagDisplayLabel, normalizeTagName } from '@core/vault/models/Tag';
import type { Workspace } from '@core/workspace/Workspace';

/**
 * The Delete confirmation's title and body, shared by the tag page and the Tags sidebar row. The
 * title names the tag the way the app displays it everywhere else (`-`/`_` read as spaces, no `#`).
 */
export function getTagDeleteConfirmationTitle(tagName: string): string {
  return `Delete ${formatTagDisplayLabel(tagName)}?`;
}

export const TAG_DELETE_CONFIRMATION_MESSAGE =
  'This will permanently delete the tag. You can\u2019t undo this action.';

/**
 * Delete handler for a tag, shared by the tag page's Delete action and the
 * Tags sidebar row's — presentation-layer glue like
 * `createTagCollectionRenameHandler`, calling the existing
 * `TagOperations.deleteTag()` (unchanged) and nothing else of the domain.
 *
 * Only when the batch completed — `deleteTag` keeps the definition
 * otherwise, and a partial result is only logged (as in every tag batch) —
 * does it forget the tag's own UI state (its saved collection configuration
 * and its sidebar expansion, so neither returns if the name is created
 * again), and — only if the user is viewing that tag's page, which no longer
 * exists — leave it for the workspace. Deleting from the sidebar while
 * looking at something else never moves the user. An incomplete delete stays
 * where it is.
 */
export function createTagCollectionDeleteHandler(
  deps: {
    readonly tagOperations: TagOperations;
    readonly navigation: NavigationRouter;
    readonly workspace: Workspace;
    readonly collectionViewConfigStore: CollectionViewConfigStore;
    readonly tagExpansionStore: TagExpansionStore;
  },
  tagName: string
): () => Promise<void> {
  return async () => {
    const result = await deps.tagOperations.deleteTag(tagName);

    if (!result.complete) {
      return;
    }

    deps.collectionViewConfigStore.deleteKey(collectionViewKeyForTag(tagName));
    deps.tagExpansionStore.removeTag(tagName);

    const active = deps.workspace.activeView;

    if (
      active?.type === 'filtered-view' &&
      active.view.kind === 'tag' &&
      normalizeTagName(active.view.tagName) === normalizeTagName(tagName)
    ) {
      deps.navigation.openWorkspace();
    }
  };
}
