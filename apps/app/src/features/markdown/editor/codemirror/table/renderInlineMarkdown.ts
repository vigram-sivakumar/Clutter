import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { tokenizeInline, type InlineSpan } from '../../../render/inlineSpan';
import { fallbackWikiLinkResolution } from '../wikilink/wikiLinkResolution';

/**
 * Renders one inactive table cell's raw Markdown text to sanitized inline
 * HTML (§B/§9, docs/table-implementation-plan.md) — CM6-independent, using
 * the same `sharedMarkdownParser`/`tokenizeInline` vocabulary the compact
 * (sidebar) renderer already established (`render/renderCompactMarkdown.tsx`),
 * so this doesn't invent a second notion of what counts as bold/italic/code/
 * WikiLink. Returns a plain HTML string rather than React/DOM nodes because
 * the caller (`TableWidget.toDOM`) builds plain `WidgetType` DOM, the same
 * constraint every other widget's own hand-copied-icon HTML strings already
 * follow (see `NoteEmbedWidget.ts`'s own doc comment).
 *
 * No resolver is injected — WikiLinks render via `fallbackWikiLinkResolution`
 * (the raw path as text, unresolved). Real resolution/click-to-activate
 * belongs to cell activation, not yet wired in this milestone.
 *
 * `renderSpan`'s styled-container cases (`bold`/`italic`/`strikethrough`/
 * `highlight`) recurse into `span.children` via `renderSpans` — a forced
 * consequence of sharing `inlineSpan.ts`'s `InlineSpan` type with the
 * compact renderer (those kinds carry `children`, not a flat `value`,
 * since the compact-rendering nested-inline composition fix), not a
 * deliberate redesign of this file's own rendering scope. The effect is
 * the same "no nested Markdown syntax leaks" property the compact
 * renderer now has, applied here for free rather than reintroducing a
 * flattened value this type no longer has a way to produce.
 */
export function renderInlineMarkdown(text: string): string {
  const tree = sharedMarkdownParser.parse(text);
  const spans = tokenizeInline(tree.topNode, text);
  return renderSpans(spans);
}

function renderSpans(spans: readonly InlineSpan[]): string {
  return spans.map(renderSpan).join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSpan(span: InlineSpan): string {
  switch (span.kind) {
    case 'text':
      return escapeHtml(span.value);
    case 'bold':
      return `<strong>${renderSpans(span.children)}</strong>`;
    case 'italic':
      return `<em>${renderSpans(span.children)}</em>`;
    case 'strikethrough':
      return `<s>${renderSpans(span.children)}</s>`;
    case 'highlight':
      return `<mark class="cm-table-cell-highlight">${renderSpans(span.children)}</mark>`;
    case 'code':
      return `<code class="cm-table-cell-code">${escapeHtml(span.value)}</code>`;
    case 'wikilink': {
      const resolution = fallbackWikiLinkResolution(span.path);
      return `<span class="cm-table-cell-wikilink">${escapeHtml(resolution.displayLabel)}</span>`;
    }
    case 'tag':
      return `<span class="cm-table-cell-tag">#${escapeHtml(span.name)}</span>`;
    case 'date':
      return escapeHtml(span.isoDate);
    case 'link':
      return escapeHtml(span.label);
    case 'image':
      return escapeHtml(span.alt);
    case 'embed':
      return escapeHtml(span.path);
  }
}
