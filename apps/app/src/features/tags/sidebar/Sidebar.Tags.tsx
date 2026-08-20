import { useState } from 'react';

import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagOperations } from '@core/application/tags/TagOperations';
import { serializeTagName } from '@core/vault/models/Tag';
import { buildTagsShortcutHandler } from '@features/tags/shortcuts/buildTagsShortcutHandler';
import { TagsShortcuts } from '@features/tags/shortcuts/TagsShortcuts';
import { renderTags } from '../helpers/renderTags';
import type { Vault } from '@core/vault/models';

interface TagsPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
  readonly tagOperations: TagOperations;
}

export function Tags({ vault, navigation, tagOperations }: TagsPanelProps) {
  const tags = [...vault.tags()];
  const onShortcut = buildTagsShortcutHandler(navigation);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Single owner of "which row's rename session is active" — same
  // editingId/onStartRename/onRenameEnd shape Sidebar.Notes.tsx already
  // uses for Note/Folder rename.
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <View navigation={<TagsShortcuts onShortcut={onShortcut} />}>
      {renderTags(tags, {
        onOpenTag: (name) => navigation.openTag(name),
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
