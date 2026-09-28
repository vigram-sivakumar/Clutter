import {
  compactBlockText,
  selectCompactBlock,
} from '@features/markdown/render/blocks/selectCompactBlock';

/**
 * Extracts a Daily Note's body-content fallback label, for use when the
 * note has no description yet. Daily Notes always have a date for a
 * filename, never a deliberate title, so their label falls through to
 * description/content well before a regular Note's would — this is that
 * fallback's sole caller (`getPageDisplayLabel`); regular Notes no longer
 * derive a label from body content at all.
 *
 * Delegates to the shared, block-aware compact-rendering policy
 * (`selectCompactBlock.ts`) rather than a second, Daily-Note-specific
 * Markdown heuristic of its own — this used to be a hand-rolled, four-
 * pattern leading-marker regex applied per line, which correctly stripped
 * a heading/list/blockquote marker on whichever line it first found
 * non-blank, but had no awareness of block structure at all: a document
 * starting with a table, fenced code block, or unlabeled thematic rule
 * would leak that construct's own raw syntax as the label (the investigated
 * gap this rewrite closes). The shared policy's block selection — skip
 * structural blocks, take the first meaningful one, never concatenate — is
 * exactly the fix, reused unchanged rather than duplicated.
 *
 * `description` (a separate, free-text metadata field) is never passed
 * through here or through the shared Markdown policy — plain user text is
 * not Markdown-parsed, per `getPageDisplayLabel.ts`'s own precedence chain,
 * which calls this function only once `description` is already known to be
 * empty.
 *
 * Returns a plain string, still containing any inline Markdown syntax the
 * selected block's own content carries (bold, WikiLink, Tag, Date, ...) —
 * unresolved on purpose. This string flows into `PageDisplayLabel.text`
 * and from there into a sidebar row's own `renderCompactMarkdown` call
 * (`DailyNote.tsx`), which is what actually tokenizes and renders that
 * inline content; this function's own job ends at "which block, and what
 * is its marker-stripped raw text," matching its pre-existing contract
 * shape exactly (a plain `string | null`), so no caller elsewhere in the
 * codebase needs to change.
 */
export function getDailyNotePrimaryDisplayText(markdown: string): string | null {
  const selection = selectCompactBlock(markdown);
  if (!selection) {
    return null;
  }

  const text = compactBlockText(selection, markdown);
  return text.length > 0 ? text : null;
}
