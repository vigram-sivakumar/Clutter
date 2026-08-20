import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagOperations } from '@core/application/tags/TagOperations';
import type { FilteredView } from '@core/workspace/Workspace';
import { formatTagDisplayLabel, serializeTagName } from '@core/vault/models/Tag';

export interface CollectionPageTitleProps {
  readonly title: string;
  readonly titleEditable: boolean;
}

/**
 * Decides the collection page's title text/editability for a given
 * filtered view. Tag is the one renameable filtered view — its title
 * uses the same display formatting the sidebar and the editor's at-rest
 * widget already use (`formatTagDisplayLabel`). Every other kind
 * (Workspace-root, Favorites) is unaffected: raw title, never editable,
 * exactly as before this feature.
 */
export function getCollectionPageTitleProps(
  view: FilteredView,
  rawTitle: string
): CollectionPageTitleProps {
  if (view.kind === 'tag') {
    return { title: formatTagDisplayLabel(rawTitle), titleEditable: true };
  }

  return { title: rawTitle, titleEditable: false };
}

/**
 * The tag collection page's title-commit handler — composes `TagOperations`
 * and `NavigationRouter` into the editor-agnostic `PageTitle`/`EditableText`
 * `onCommit` boundary, same file-placement/composition reasoning as
 * `resolveTag.ts`/`tagSuggestions.ts`: this is presentation-layer glue,
 * calling the exact same `TagOperations.rename()` the sidebar's rename
 * action already calls — not a second rename implementation.
 *
 * On success, re-opens the tag view under its new canonical identity
 * (`NavigationRouter.openTag`) so the active filtered view — keyed only by
 * `tagName`, unlike a page's id-keyed active view — never remains pointed
 * at a stale, renamed-away name.
 *
 * `canRename()` mirrors rename()'s own validation exactly (same
 * normalizeTagName rules, same collision scan) — empty AND a
 * duplicate-identity collision both return `false` here, synchronously,
 * before ever calling rename(). Required, not defensive: EditableText
 * treats any non-`false` return (undefined included) as an accepted
 * commit, so silently returning here would exit edit mode immediately
 * with nothing persisted, indistinguishable from a real rename. Returning
 * `false` lets EditableText's own rejected-commit behavior (stay open,
 * refocus with the caret at the end, shake — no error message yet, a
 * separate, later task) do the work instead of this handler
 * reimplementing it.
 */
export function createTagCollectionRenameHandler(
  tagOperations: TagOperations,
  navigation: NavigationRouter,
  currentTagName: string
): (value: string) => void | boolean {
  return (value) => {
    if (!tagOperations.canRename(currentTagName, value)) {
      return false;
    }

    const newName = serializeTagName(value.trim());

    // rename() re-validates internally, so this can still reject in
    // principle (e.g. a collision created between the check above and
    // this call) — leaves the active view untouched, no navigation
    // follow-up, no bespoke error UI (matches this codebase's existing
    // fire-and-forget convention for this class of action handler, e.g.
    // onArchiveNote/onDeleteNote in Sidebar.Notes.tsx). Caught here so a
    // failed rename never surfaces as an unhandled promise rejection. By
    // this point EditableText has already exited edit mode (canRename
    // already said yes), so a late rejection here has no stay-open/shake
    // path — only the synchronous canRename() check above can
    // reject-and-stay-open.
    void tagOperations
      .rename(currentTagName, newName)
      .then(() => navigation.openTag(newName))
      .catch(() => {});
  };
}
