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
 */
export function renderInlineMarkdown(text: string): string {
  const tree = sharedMarkdownParser.parse(text);
  const spans = tokenizeInline(tree.topNode, text);
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
      return `<strong>${escapeHtml(span.value)}</strong>`;
    case 'italic':
      return `<em>${escapeHtml(span.value)}</em>`;
    case 'strikethrough':
      return `<s>${escapeHtml(span.value)}</s>`;
    case 'highlight':
      return `<mark class="cm-table-cell-highlight">${escapeHtml(span.value)}</mark>`;
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
