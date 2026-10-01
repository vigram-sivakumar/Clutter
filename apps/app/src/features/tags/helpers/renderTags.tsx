import { Fragment } from 'react/jsx-runtime';
import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import { Tag } from '../sidebar/Tag';
import { buildTagSidebarMenu } from '../sidebar/tagSidebarMenu.config';
import { groupTagsByFavorite } from './groupTagsByFavorite';
import { formatTagDisplayLabel, type Tag as TagModel } from '@core/vault/models/Tag';
import { Note } from '@features/notes/sidebar/Note';
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
} from '@core/presentation/getPageDisplayLabel';
import { testIds } from '@shared/testing/selectors';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';

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
  /**
   * Opens a note clicked from a tag's expanded inline list, then requests
   * an editor reveal for every occurrence of that tag in it — mirrors Tag
   * collection's own "Open note" entry point (PageHost's
   * openNoteFromCollection), just triggered from the sidebar instead.
   */
  onOpenNote(pageId: string, tagName: string): void;
  /**
   * Single owner of "is this tag expanded in the sidebar," persisted
   * across reloads (see `TagExpansionStore`'s own doc comment for why
   * this isn't `Workspace`) — passed through rather than re-derived here,
   * same as FolderTree taking `workspace`/`membershipSelector` directly
   * instead of owning either itself.
   */
  tagExpansionStore: TagExpansionStore;
  /**
   * `workspace` is still needed here for `activePageId` (a child note
   * row's selected state) — expansion itself no longer lives on it, see
   * `tagExpansionStore` above.
   */
  workspace: Workspace;
  /** The existing tag->notes index the Tag Collection view already reads. */
  effectivePageState: EffectivePageState;
  rowActions?: TagRowActions;
}

function renderTagRow(
  tag: TagModel,
  isFavorite: boolean,
  onOpenTag: (name: string) => void,
  onOpenNote: (pageId: string, tagName: string) => void,
  tagExpansionStore: TagExpansionStore,
  workspace: Workspace,
  effectivePageState: EffectivePageState,
  rowActions?: TagRowActions
) {
  const menuItems = rowActions ? buildTagSidebarMenu() : undefined;
  const isEditing = rowActions?.editingId === tag.name;
  // A tag with zero occurrences has nothing to expand into — same
  // "isEmpty forces the caret collapsed" rule as Folder's own isEmpty,
  // and avoids ever querying getPagesByTag for a tag that can't have any.
  const isEmpty = tag.usageCount === 0;
  const isExpanded = isEmpty ? false : tagExpansionStore.isExpanded(tag.name);
  // Only fetched while actually expanded — satisfies "don't parse/query
  // every note repeatedly every time a tag is expanded" by not querying
  // at all for a collapsed or empty tag; the query itself is the existing
  // EffectivePageState.getPagesByTag index, not a new scan.
  const notes = isExpanded ? effectivePageState.getPagesByTag(tag.name) : [];

  return (
    <Fragment key={tag.name}>
      <Tag
        title={formatTagDisplayLabel(tag.name)}
        emoji={tag.icon}
        count={tag.usageCount}
        isFavorite={isFavorite}
        isEmpty={isEmpty}
        isExpanded={isExpanded}
        onExpandToggle={() => tagExpansionStore.toggleExpanded(tag.name)}
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
      {isExpanded &&
        notes.map((note) => {
          const label = getPageDisplayLabel(note);

          return (
            <Note
              key={note.id}
              data-testid={testIds.sidebar.noteItem(note.id)}
              title={label.text}
              titleStyle={getPageDisplayLabelStyle(label)}
              emoji={note.icon}
              level={1}
              selected={workspace.activePageId === note.id}
              onClick={() => onOpenNote(note.id, tag.name)}
            />
          );
        })}
    </Fragment>
  );
}

export function renderTags(tags: readonly TagModel[], options: RenderTagsOptions) {
  const { favorites, others } = groupTagsByFavorite(tags);
  const { onOpenTag, onOpenNote, tagExpansionStore, workspace, effectivePageState, rowActions } =
    options;

  return (
    <>
      <FavoritesSection isEmpty={favorites.length === 0} title="Favorites">
        {favorites.map((tag) =>
          renderTagRow(
            tag,
            true,
            onOpenTag,
            onOpenNote,
            tagExpansionStore,
            workspace,
            effectivePageState,
            rowActions
          )
        )}
      </FavoritesSection>
      <Section hasHeader={favorites.length > 0} title="Others">
        {others.map((tag) =>
          renderTagRow(
            tag,
            false,
            onOpenTag,
            onOpenNote,
            tagExpansionStore,
            workspace,
            effectivePageState,
            rowActions
          )
        )}
      </Section>
    </>
  );
}
