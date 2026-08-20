import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import { Tag } from '../sidebar/Tag';
import { buildTagSidebarMenu } from '../sidebar/tagSidebarMenu.config';
import { groupTagsByFavorite } from './groupTagsByFavorite';
import { formatTagDisplayLabel, type Tag as TagModel } from '@core/vault/models/Tag';

export interface TagRowActions {
  openMenuId: string | null;
  onOpenMenu(name: string): void;
  onCloseMenu(): void;
  onChangeTagIcon(name: string, emoji: string | null): void;

  /** Raw/canonical tag name of the row currently mid-rename, or null. */
  editingId: string | null;
  onStartRename(name: string): void;
  onRenameEnd(): void;
  /**
   * `value` is whatever the user typed (a display-style or canonical
   * string) — see Sidebar.Tags.tsx's own serialization step. Returning
   * `false` rejects it (empty/invalid) — forwarded straight through to
   * EditableText's own `onCommit` via `Tag.tsx`'s `onTitleCommit`.
   */
  onCommitRename(oldName: string, value: string): void | boolean;
}

interface RenderTagsOptions {
  onOpenTag(name: string): void;
  rowActions?: TagRowActions;
}

function renderTagRow(
  tag: TagModel,
  isFavorite: boolean,
  onOpenTag: (name: string) => void,
  rowActions?: TagRowActions
) {
  const menuItems = rowActions ? buildTagSidebarMenu() : undefined;
  const isEditing = rowActions?.editingId === tag.name;

  return (
    <Tag
      key={tag.name}
      title={formatTagDisplayLabel(tag.name)}
      emoji={tag.icon}
      count={tag.usageCount}
      isFavorite={isFavorite}
      onClick={isEditing ? undefined : () => onOpenTag(tag.name)}
      isEditing={isEditing}
      onTitleCommit={
        rowActions ? (value) => rowActions.onCommitRename(tag.name, value) : undefined
      }
      // Only onTitleEditingEnd ends the session — EditableText's own
      // handleBlur already calls onEditingEnd unconditionally (committed
      // OR escaped), so wiring onTitleCancel to the same onRenameEnd()
      // would double-fire it on every Escape.
      onTitleEditingEnd={rowActions ? () => rowActions.onRenameEnd() : undefined}
      menuItems={menuItems}
      menuOpen={rowActions?.openMenuId === tag.name}
      onMenuOpenChange={
        rowActions
          ? (open) => (open ? rowActions.onOpenMenu(tag.name) : rowActions.onCloseMenu())
          : undefined
      }
      onMenuSelect={
        rowActions
          ? (id) => {
              if (id === 'rename') {
                rowActions.onStartRename(tag.name);
              }
            }
          : undefined
      }
      onChangeIcon={
        rowActions
          ? (emoji) => rowActions.onChangeTagIcon(tag.name, emoji)
          : undefined
      }
    />
  );
}

export function renderTags(tags: readonly TagModel[], options: RenderTagsOptions) {
  const { favorites, others } = groupTagsByFavorite(tags);
  const { onOpenTag, rowActions } = options;

  return (
    <>
      <FavoritesSection isEmpty={favorites.length === 0} title="Favorites">
        {favorites.map((tag) => renderTagRow(tag, true, onOpenTag, rowActions))}
      </FavoritesSection>
      <Section hasHeader={favorites.length > 0} title="Others">
        {others.map((tag) => renderTagRow(tag, false, onOpenTag, rowActions))}
      </Section>
    </>
  );
}
