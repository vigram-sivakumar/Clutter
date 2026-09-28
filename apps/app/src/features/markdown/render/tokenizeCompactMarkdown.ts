import type { InlineSpan } from './inlineSpan';
import { compactBlockSpans, selectCompactBlock } from './blocks/selectCompactBlock';

/** @deprecated use `InlineSpan` — kept as an alias so existing imports don't break. */
export type CompactSpan = InlineSpan;

/**
 * Tokenizes `text` into a flat, marker-free sequence of `CompactSpan`s for
 * compact (sidebar-row) display — pure, React- and CodeMirror-independent.
 *
 * Block-aware since the compact-rendering policy (`selectCompactBlock.ts`):
 * `text` is parsed once, the first meaningful top-level block is selected
 * (skipping structural blocks — tables, fenced code, unlabeled thematic
 * rules — never concatenating multiple blocks together), and only that
 * block's own inline content is tokenized. For a plain single-block input
 * (a Note's filename, a Task's own text line — both already single
 * paragraphs in practice) this selects that one paragraph and behaves
 * exactly as the old whole-document walk did; the block-selection step
 * only changes behavior for genuinely multi-block or structural-only
 * input, which is exactly the gap it exists to close.
 */
export function tokenizeCompactMarkdown(text: string): CompactSpan[] {
  const selection = selectCompactBlock(text);
  return selection ? compactBlockSpans(selection, text) : [];
}
