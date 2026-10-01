import { useState } from 'react';

import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagOperations } from '@core/application/tags/TagOperations';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { Workspace } from '@core/workspace/Workspace';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';
import { getTagOccurrenceRanges } from '@core/presentation/getTagOccurrenceRanges';
import { serializeTagName } from '@core/vault/models/Tag';
import { buildTagsShortcutHandler } from '@features/tags/shortcuts/buildTagsShortcutHandler';
import { TagsShortcuts } from '@features/tags/shortcuts/TagsShortcuts';
import { renderTags } from '../helpers/renderTags';
import type { Vault } from '@core/vault/models';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';
import { useTagExpansionStore } from '@app/hooks/useTagExpansionStore';

interface TagsPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
  readonly tagOperations: TagOperations;
  readonly pageOperations: PageOperations;
  readonly effectivePageState: EffectivePageState;
  readonly workspace: Workspace;
  /** Persisted expansion state (survives app reload) — see its own doc comment for why this isn't on `workspace`. */
  readonly tagExpansionStore: TagExpansionStore;
  /** See AppLayout's own doc comment on its `pendingReveal` state — set here by an expanded tag's note click, same pipeline Tag collection's "Open note" already drives. */
  readonly onRequestReveal: (reveal: PendingEditorReveal) => void;
}

export function Tags({
  vault,
  navigation,
  tagOperations,
  pageOperations,
  effectivePageState,
  workspace,
  tagExpansionStore,
  onRequestReveal,
}: TagsPanelProps) {
  // Forces a re-render when a tag's expansion is toggled — the store is
  // the source of truth (and what actually persists), this hook is purely
  // the view-layer subscription, same shape as useWorkspace/
  // useEffectivePageState.
  useTagExpansionStore(tagExpansionStore);
  const tags = [...vault.tags()];
  const onShortcut = buildTagsShortcutHandler(navigation);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Single owner of "which row's rename session is active" — same
  // editingId/onStartRename/onRenameEnd shape Sidebar.Notes.tsx already
  // uses for Note/Folder rename.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Mirrors PageHost's openNoteFromCollection exactly (same
  // pageOperations.open + getTagOccurrenceRanges + onRequestReveal
  // sequence) — the Tags sidebar's own entry point into the same, generic
  // reveal pipeline.
  const onOpenNote = (pageId: string, tagName: string): void => {
    pageOperations.open(pageId);

    const ranges = getTagOccurrenceRanges(vault.getPage(pageId), tagName);

    if (ranges.length > 0) {
      onRequestReveal({ pageId, ranges });
    }
  };

  return (
    <View navigation={<TagsShortcuts onShortcut={onShortcut} />}>
      {renderTags(tags, {
        onOpenTag: (name) => navigation.openTag(name),
        onOpenNote,
        tagExpansionStore,
        workspace,
        effectivePageState,
        rowActions: {
          openMenuId,
          onOpenMenu: (name) => setOpenMenuId(name),
          onCloseMenu: () => setOpenMenuId(null),
          onChangeTagIcon: (name, emoji) =>
            void tagOperations.updateMetadata(
              name,
              emoji === null ? { icon: undefined } : { icon: emoji }
            ),

          editingId,
          onStartRename: (name) => {
            setOpenMenuId(null);
            setEditingId(name);
          },
          onRenameEnd: () => setEditingId(null),
          // `canRename()` mirrors rename()'s own validation exactly (same
          // normalizeTagName rules, same collision scan) — empty AND a
          // duplicate-identity collision both return `false` here now,
          // synchronously, before ever calling rename(). Returning `false`
          // is required, not just defensive: EditableText treats anything
          // other than `false` as an accepted commit (undefined included),
          // so silently `return`ing — the previous shape — exited edit
          // mode immediately with nothing persisted, indistinguishable
          // from a successful rename. Returning `false` instead keeps
          // EditableText's own rejected-commit behavior (stay open,
          // refocus with the caret at the end, shake — no error message
          // yet, that's a separate, later task) doing the work, rather
          // than this callback reimplementing any of it.
          onCommitRename: (oldName, value) => {
            if (!tagOperations.canRename(oldName, value)) {
              return false;
            }

            const newName = serializeTagName(value.trim());

            // rename() re-validates internally, so this can still reject
            // in principle (e.g. a tag created by someone else between
            // the check above and this call) — same fire-and-forget,
            // caught-and-silent convention as onArchiveNote/onDeleteNote
            // in Sidebar.Notes.tsx. By this point EditableText has
            // already exited edit mode (canRename already said yes), so a
            // late rejection here has no stay-open/shake path — only the
            // synchronous canRename() check above can reject-and-stay-open.
            void tagOperations.rename(oldName, newName).catch(() => {});
          },
        },
      })}
    </View>
  );
}
