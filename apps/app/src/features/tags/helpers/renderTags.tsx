import { Fragment } from 'react/jsx-runtime';
import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import { Tag } from '../sidebar/Tag';
import { TagContextEntry } from '../sidebar/TagContextEntry';
import { buildTagSidebarMenu } from '../sidebar/tagSidebarMenu.config';
import { groupTagsByFavorite } from './groupTagsByFavorite';
import { formatTagDisplayLabel, type Tag as TagModel } from '@core/vault/models/Tag';
import { PageEntry, type NoteRowActions } from '@features/notes/sidebar/FolderTree';
import type { Vault } from '@core/vault/models';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { TagExpansionStore } from '@core/application/tags/TagExpansionStore';
import { getTagLineContexts, type TagLineContext } from '@core/presentation/getTagLineContexts';
import type { SourceRange } from '@core/presentation/getTagOccurrenceRanges';
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
   * Opens a note that belongs to this tag only through frontmatter
   * (note-level membership) — no editor reveal, since there is no body
   * occurrence to point at. See onOpenContextEntry below for the inline-
   * occurrence counterpart.
   */
  onOpenNoteEntry(pageId: string): void;
  /**
   * Opens the note an inline tag-context entry belongs to, then requests
   * an editor reveal for that exact occurrence's line (ranges already
   * resolved by getTagLineContexts — never recomputed by text search).
   * Mirrors Tag collection's own "Open note" entry point (PageHost's
   * openNoteFromCollection), just per-line rather than whole-note.
   */
  onOpenContextEntry(pageId: string, ranges: readonly SourceRange[]): void;
  /**
   * Raw Vault read access — needed to resolve a page's current
   * `analysis.tags`/`source.markdown` for getTagLineContexts (EffectivePage
   * carries neither). Read-only; no write path touches this.
   */
  vault: Vault;
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
  /**
   * The existing tag->notes indexes the Tag Collection view already
   * reads — inline-occurrence membership (getPagesByTag) and note-level
   * frontmatter membership (getPagesByFrontmatterTag), each a genuinely
   * different reason a note belongs to this tag (PageMetadata.tags's own
   * doc comment: independent, never synchronized) — both are shown,
   * never merged into one.
   */
  effectivePageState: EffectivePageState;
  /**
   * The exact same Note-row action handlers (menu, rename, archive,
   * favorite, move, reveal/copy-path) the Notes sidebar's own notes
   * dispatch through — see `PageEntry`'s own doc comment for why a
   * frontmatter note entry rendered here must behave identically rather
   * than through a reduced, parallel implementation. Never applied to a
   * TagContextEntry — a content occurrence, not a note, has no note
   * actions of its own.
   */
  noteRowActions?: NoteRowActions;
  /**
   * The expanded-note-list's one extra action, "Reveal in Clutter" —
   * switches to the Notes sidebar tab and locates the note there
   * (expand ancestors, scroll, flash-highlight), without opening it.
   * This is the only action added beyond the standard note menu — see
   * `PageEntry`'s `extraMenuItems`/`onExtraMenuSelect` for how it's
   * appended without touching the Notes sidebar's own menu. Only ever
   * offered on a frontmatter note entry, never a context entry.
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

/**
 * One note that belongs to a tag, plus everything about *why* it does —
 * the two reasons (PageMetadata.tags's own doc comment) are independent
 * and both rendered when both apply, never collapsed into one row. See
 * the module's own "TagContextEntry vs. NoteEntry" distinction.
 */
interface TagChild {
  readonly note: EffectivePage;
  readonly hasFrontmatterMembership: boolean;
  readonly lineContexts: readonly TagLineContext[];
}

/**
 * Resolves everything an expanded tag needs to render its children:
 * every note that belongs to it (via either inline occurrence or
 * frontmatter membership, union'd and deduplicated by id — the same note
 * can have both, and still gets exactly one TagChild carrying both
 * facts, per the module's own "do not deduplicate into one item" rule
 * *between* a note entry and its context entries, while still only
 * resolving the note itself once), each annotated with its frontmatter
 * membership flag and its inline occurrences grouped by line
 * (getTagLineContexts). Ordering: getPagesByTag's own order first (the
 * existing tag->notes ordering convention), then any additional
 * frontmatter-only notes it didn't already include — no new sort
 * introduced for either list.
 */
function getTagChildren(
  tagName: string,
  vault: Vault,
  effectivePageState: EffectivePageState
): TagChild[] {
  const inlineNotes = effectivePageState.getPagesByTag(tagName);
  const frontmatterNotes = effectivePageState.getPagesByFrontmatterTag(tagName);
  const frontmatterIds = new Set(frontmatterNotes.map((note) => note.id));

  const orderedNotes = [...inlineNotes];
  for (const note of frontmatterNotes) {
    if (!inlineNotes.some((existing) => existing.id === note.id)) {
      orderedNotes.push(note);
    }
  }

  return orderedNotes.map((note) => ({
    note,
    hasFrontmatterMembership: frontmatterIds.has(note.id),
    lineContexts: getTagLineContexts(vault.getPage(note.id), tagName),
  }));
}

function renderTagRow(tag: TagModel, isFavorite: boolean, options: RenderTagsOptions) {
  const {
    onOpenTag,
    onOpenNoteEntry,
    onOpenContextEntry,
    vault,
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
  // Only resolved while actually expanded — satisfies "don't parse/query
  // every note repeatedly every time a tag is expanded" by not querying
  // at all for a collapsed or empty tag; every read here is an existing
  // index/already-computed analysis, never a fresh Markdown parse.
  const children = isExpanded ? getTagChildren(tag.name, vault, effectivePageState) : [];

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
        children.map(({ note, hasFrontmatterMembership, lineContexts }) => (
          <Fragment key={note.id}>
            {/* Ordering within one note: frontmatter note-level entry
                first, then its inline occurrences in document order —
                per the module's own stated ordering rule. */}
            {hasFrontmatterMembership && (
              <PageEntry
                entry={note}
                level={1}
                workspace={workspace}
                // The Tags sidebar's note entry represents note-level
                // membership, not "this is the open page" — it must not
                // light up just because its own sibling context entry
                // (or anything else) opened this same note elsewhere.
                // See PageEntry's own highlightActive doc comment.
                highlightActive={false}
                onPageClick={onOpenNoteEntry}
                // getPagesByFrontmatterTag/getPagesByTag are both
                // durable-only (see their own doc comments) — a note
                // reached from here is never a draft, so this branch is
                // provably unreachable, same as PageEntry's own callers
                // that guard entry.isDraft before choosing which handler
                // to call.
                onDraftPageClick={() => {}}
                rowActions={noteRowActions}
                resolveWikiLink={resolveWikiLink}
                resolveTag={resolveTag}
                resolveEmbed={resolveEmbed}
                extraMenuItems={
                  onRevealInNotesSidebar
                    ? [
                        {
                          id: REVEAL_IN_NOTES_SIDEBAR_ITEM_ID,
                          label: 'Reveal in Clutter',
                          icon: 'folder',
                        },
                      ]
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
            )}
            {lineContexts.map((context, index) => (
              <TagContextEntry
                // Index-keyed, not offset-keyed: stable enough for one
                // render pass, and offsets can legitimately shift between
                // renders as the note is edited elsewhere — this list is
                // only ever (re)computed fresh per render, never diffed
                // against a previous one.
                key={`${note.id}-context-${index}`}
                level={1}
                lineText={context.lineText}
                onClick={() => onOpenContextEntry(note.id, context.ranges)}
                resolveWikiLink={resolveWikiLink}
                resolveTag={resolveTag}
                resolveEmbed={resolveEmbed}
              />
            ))}
          </Fragment>
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
