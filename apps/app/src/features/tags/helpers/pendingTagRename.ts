import { compareTagNames, normalizeTagName, type Tag } from '@core/vault/models/Tag';

/** A rename the user has confirmed that `TagOperations.rename` has not finished yet. `newName` is the canonical spelling. */
export interface PendingTagRename {
  readonly oldName: string;
  readonly newName: string;
}

/**
 * The tags as the sidebar should draw them while renames are still running.
 *
 * `TagOperations.rename` is not one step: it rewrites the notes that use the tag one at a time, and only when that is
 * done moves the tag's definition (pinned, emoji) to the new name. Drawn straight from the Vault, the row would show the
 * OLD name from the moment the rename is confirmed, and — once the first note is rewritten — the new name as a second,
 * unpinned tag under Others, until the definition catches up and it jumps to Pinned.
 *
 * So while a rename is pending, the old tag and the new one are shown as ONE tag: named as the user typed it, carrying the
 * old tag's definition (pinned, emoji) and both usage counts, placed where its new name sorts. Once the old tag is gone
 * the real new tag already carries its own definition and is shown as it is. Nothing is written anywhere: this only
 * changes what is drawn, and it ends when the rename settles (done, partial or failed), when the Vault's own tags show.
 */
export function applyPendingTagRenames(tags: readonly Tag[], pending: readonly PendingTagRename[]): readonly Tag[] {
  let result = tags;

  for (const { oldName, newName } of pending) {
    result = applyOne(result, oldName, newName);
  }

  return result;
}

function applyOne(tags: readonly Tag[], oldName: string, newName: string): readonly Tag[] {
  const oldKey = normalizeTagName(oldName);
  const newKey = normalizeTagName(newName);
  const from = tags.find((tag) => normalizeTagName(tag.name) === oldKey);

  // The old tag is gone: the rename has reached the new tag, which is real and carries its own definition.
  if (!from) {
    return tags;
  }

  // The same tag respelled ("Project" → "project") has no second tag; a different one may already hold some notes.
  const to = oldKey === newKey ? undefined : tags.find((tag) => normalizeTagName(tag.name) === newKey);
  const renamed: Tag = { ...from, name: newName, usageCount: from.usageCount + (to?.usageCount ?? 0) };

  return [...tags.filter((tag) => tag !== from && tag !== to), renamed].sort((a, b) => compareTagNames(a.name, b.name));
}
