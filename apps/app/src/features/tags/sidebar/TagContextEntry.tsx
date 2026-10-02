import { Entry, type EntryProps } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import './TagContextEntry.css';

export interface TagContextEntryProps extends Omit<EntryProps, 'children' | 'leading'> {
  /** The exact containing Markdown line — never a generated snippet. */
  lineText: string;
  /** Same compact-Markdown resolution Note/Task/DailyNote rows already inject — see renderCompactMarkdown's own doc comment. */
  resolveWikiLink?: ResolveWikiLink;
  resolveTag?: ResolveTag;
  resolveEmbed?: ResolvePageEmbed;
}

/**
 * A single inline `#tag` occurrence's containing line, rendered as its
 * own sidebar row under an expanded tag — distinct from a `Note` row
 * (which represents the note itself, not a specific occurrence inside
 * it). Built on the same `Entry` primitive every sidebar row uses, not a
 * second tree/row implementation: same leading/content/trailing slots,
 * hover/active state, indentation, and truncation.
 *
 * Content is rendered through `renderCompactMarkdown` — the same
 * compact-Markdown primitive Task/DailyNote rows already use for their
 * own title — not a raw-text `<span>`, so the line's own emphasis/links/
 * code/strikethrough/tags render the same way they would anywhere else
 * in the sidebar, never raw syntax, while the tag occurrence itself
 * still reads as plain visible text within that rendering.
 *
 * Leading icon is `squiggleLine` — a lightweight, already-existing
 * system icon communicating "a piece of written content," distinct from
 * `Note`'s own note-shaped icon (which represents the note entity
 * itself, not an occurrence inside it).
 */
export function TagContextEntry({
  lineText,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  ...entryProps
}: TagContextEntryProps) {
  return (
    <Entry
      {...entryProps}
      leading={<AppIcon className="tag-context-entry__icon" icon="squiggleLine" />}
    >
      <span className="tag-context-entry__text">
        {renderCompactMarkdown(lineText, { resolveWikiLink, resolveTag, resolveEmbed })}
      </span>
    </Entry>
  );
}
