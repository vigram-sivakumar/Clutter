import { Fragment } from 'react/jsx-runtime';
import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import { Tag } from '../sidebar/Tag';
import { buildTagSidebarMenu } from '../sidebar/tagSidebarMenu.config';
import { groupTagsByFavorite } from './groupTagsByFavorite';
import { formatTagDisplayLabel, type Tag as TagModel } from '@core/vault/models/Tag';
import { PageEntry, type NoteRowActions } from '@features/notes/sidebar/FolderTree';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';

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
   * row's selected state, read by `PageEntry` itself) — expansion itself
   * no longer lives on it, see `tagExpansionStore` above.
   */
  workspace: Workspace;
  /** The existing tag->notes index the Tag Collection view already reads. */
  effectivePageState: EffectivePageState;
  /**
   * The exact same Note-row action handlers (menu, rename, archive,
   * favorite, move, reveal/copy-path) the Notes sidebar's own notes
   * dispatch through — see `PageEntry`'s own doc comment for why a note
   * rendered here must behave identically rather than through a reduced,
   * parallel implementation.
   */
  noteRowActions?: NoteRowActions;
  /**
   * The expanded-note-list's one extra action, "Reveal in Clutter" —
   * switches to the Notes sidebar tab and locates the note there
   * (expand ancestors, scroll, flash-highlight), without opening it.
   * This is the only action added beyond the standard note menu — see
   * `PageEntry`'s `extraMenuItems`/`onExtraMenuSelect` for how it's
   * appended without touching the Notes sidebar's own menu.
   */
  onRevealInNotesSidebar?(pageId: string): void;
  /**
   * The tag row's "+" action (same placement/styling as a Folder's own
   * "+") — creates a new note already carrying this tag in its
   * frontmatter. Optional so a caller without this capability (none
   * today) simply omits the affordance, same convention as every other
   * optional action here.
   */
  onCreateNoteForTag?(tagName: string): void;
  resolveWikiLink?: ResolveWikiLink;
  resolveTag?: ResolveTag;
  resolveEmbed?: ResolvePageEmbed;
  rowActions?: TagRowActions;
}

const REVEAL_IN_NOTES_SIDEBAR_ITEM_ID = 'reveal-in-notes-sidebar';

function renderTagRow(tag: TagModel, isFavorite: boolean, options: RenderTagsOptions) {
  const {
    onOpenTag,
    onOpenNote,
    tagExpansionStore,
    workspace,
    effectivePageState,
    noteRowActions,
    onRevealInNotesSidebar,
    onCreateNoteForTag,
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
    rowActions,
  } = options;
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
        onAddClick={onCreateNoteForTag ? () => onCreateNoteForTag(tag.name) : undefined}
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
        notes.map((note) => (
          <PageEntry
            key={note.id}
            entry={note}
            level={1}
            workspace={workspace}
            onPageClick={(pageId) => onOpenNote(pageId, tag.name)}
            // getPagesByTag is durable-only (see its own doc comment) — a
            // note reached from here is never a draft, so this branch is
            // provably unreachable, same as PageEntry's own callers that
            // guard entry.isDraft before choosing which handler to call.
            onDraftPageClick={() => {}}
            rowActions={noteRowActions}
            resolveWikiLink={resolveWikiLink}
            resolveTag={resolveTag}
            resolveEmbed={resolveEmbed}
            extraMenuItems={
              onRevealInNotesSidebar
                ? [{ id: REVEAL_IN_NOTES_SIDEBAR_ITEM_ID, label: 'Reveal in Clutter', icon: 'folder' }]
                : undefined
            }
            onExtraMenuSelect={
              onRevealInNotesSidebar
                ? (id) => {
                    if (id === REVEAL_IN_NOTES_SIDEBAR_ITEM_ID) {
                      onRevealInNotesSidebar(note.id);
                    }
                  }
                : undefined
            }
          />
        ))}
    </Fragment>
  );
}

export function renderTags(tags: readonly TagModel[], options: RenderTagsOptions) {
  const { favorites, others } = groupTagsByFavorite(tags);

  return (
    <>
      <FavoritesSection isEmpty={favorites.length === 0} title="Favorites">
        {favorites.map((tag) => renderTagRow(tag, true, options))}
      </FavoritesSection>
      <Section hasHeader={favorites.length > 0} title="Others">
        {others.map((tag) => renderTagRow(tag, false, options))}
      </Section>
    </>
  );
}
