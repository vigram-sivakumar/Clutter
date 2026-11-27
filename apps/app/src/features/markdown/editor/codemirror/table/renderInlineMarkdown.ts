import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { tokenizeInline, type InlineSpan } from '../../../render/inlineSpan';
import { fallbackWikiLinkResolution } from '../wikilink/wikiLinkResolution';
import type { EditorView, WidgetType } from '@codemirror/view';
import type { ParticipantResolvers } from '../highlight/inlineLivePreviewParticipants';
import { renderWikiLink } from '../wikilink/wikiLinkDecorations';
import { renderTag } from '../tag/tagDecorations';
import { renderDate } from '../date/dateDecorations';
import { getWikiLinkSourceActivation } from '../wikilink/wikiLinkActivation';
import { wikiLinkEditCaret } from '../wikilink/wikiLinkMouseHandlers';
import { getLinkSourceActivation } from '../link/linkActivation';
import { handleRenderedTokenPress } from '../semanticToken/tokenMouseHandlers';

interface ProjectedLink {
  readonly activation: () => (() => void) | null;
  readonly editCaret?: number;
}

// Occurrence metadata belongs to the painted leaf, not the cell's label or
// a second editable document. Removed/repainted elements cannot be hits.
const projectedLinks = new WeakMap<Element, ProjectedLink>();

export function handleProjectedLinkPress(
  host: HTMLElement, event: MouseEvent, edit?: (caret: number) => boolean, beforeActivate?: () => void
): boolean {
  let target = event.target instanceof Element ? event.target : null;
  while (target && target !== host && host.contains(target)) {
    const link = projectedLinks.get(target);
    if (link) {
      const handled = handleRenderedTokenPress(event, () => {
        const activate = link.activation();
        if (!activate) return false;
        beforeActivate?.();
        activate();
        return true;
      }, edit && link.editCaret !== undefined ? () => edit(link.editCaret!) : undefined);
      if (handled) event.stopPropagation();
      return handled;
    }
    target = target.parentElement;
  }
  return false;
}

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
 * String output is also the clipboard contract; it intentionally has no
 * resolver or live token DOM. The static on-screen cell uses the same
 * span walk via paintInlineMarkdown, with the existing editor widgets.
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
 *
 * `styled` adds the editor's own `tok-*` classes (`MarkdownEditor.css`) to
 * bold/italic/strikethrough/highlight/code, so an inactive cell looks exactly
 * like the same formatting in a paragraph from one set of rules. Left off for
 * the clipboard's HTML, which must not carry editor classes.
 */
export function renderInlineMarkdown(text: string, options: { readonly styled?: boolean } = {}): string {
  const tree = sharedMarkdownParser.parse(text);
  const spans = tokenizeInline(tree.topNode, text, undefined, { preserveDestinationlessLinks: true, wikiLinkContext: 'table' });
  return renderSpans(spans, options.styled === true);
}

type RenderLeaf = (span: InlineSpan) => string | undefined;

function renderSpans(spans: readonly InlineSpan[], styled: boolean, renderLeaf?: RenderLeaf): string {
  return spans.map((span) => renderSpan(span, styled, renderLeaf)).join('');
}

/** On-screen projection only. Actual token DOM comes from the same widget
 * factories as Live Preview. No extra EditorView and no HTML serialization
 * of widgets (which would discard their DOM lifecycle). Clipboard stays on
 * renderInlineMarkdown and never receives live widgets or resolver output. */
export function paintInlineMarkdown(
  host: HTMLElement, text: string, view: EditorView, resolvers: Partial<ParticipantResolvers> = {},
): void {
  const tree = sharedMarkdownParser.parse(text);
  const spans = tokenizeInline(tree.topNode, text, undefined, { includeSemanticSource: true, includeActivationSource: true, preserveDestinationlessLinks: true, wikiLinkContext: 'table' });
  const nodes: HTMLElement[] = [];
  const renderLeaf: RenderLeaf = span => {
    let widget: WidgetType | null = null;
    if (span.kind === 'wikilink' && span.source !== undefined) {
      widget = renderWikiLink(span.source, resolvers.resolveWikiLink ?? (() => undefined), [], 'table');
    } else if (span.kind === 'tag' && span.source !== undefined) {
      widget = renderTag(span.source, resolvers.resolveTag ?? (() => undefined));
    } else if (span.kind === 'date' && span.source !== undefined) {
      widget = renderDate(span.source, resolvers.resolveDate ?? (() => undefined));
    } else if (span.kind === 'link') {
      const element = host.ownerDocument.createElement('span');
      element.className = 'tok-link';
      const title = element.appendChild(host.ownerDocument.createElement('span'));
      title.className = 'tok-link-title';
      title.textContent = span.label;
      const occurrence = span.activationSource;
      if (occurrence) projectedLinks.set(element, {
        activation: () => getLinkSourceActivation(tree, (from, to) => text.slice(from, to), occurrence),
      });
      const index = nodes.push(element) - 1;
      return `<span data-inline-widget="${index}"></span>`;
    } else {
      return undefined;
    }
    if (!widget) return span.source === undefined ? undefined : escapeHtml(span.source);
    const element = widget.toDOM(view);
    if (span.kind === 'wikilink' && span.source !== undefined && span.activationSource) {
      const raw = span.source;
      projectedLinks.set(element, {
        activation: () => getWikiLinkSourceActivation(raw, resolvers.resolveWikiLink ?? (() => undefined), 'table'),
        editCaret: wikiLinkEditCaret(raw, span.activationSource.to),
      });
    }
    const index = nodes.push(element) - 1;
    return `<span data-inline-widget="${index}"></span>`;
  };
  host.innerHTML = renderSpans(spans, true, renderLeaf);
  for (const placeholder of host.querySelectorAll<HTMLElement>('[data-inline-widget]')) {
    placeholder.replaceWith(nodes[Number(placeholder.dataset.inlineWidget)]!);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSpan(span: InlineSpan, styled: boolean, renderLeaf?: RenderLeaf): string {
  const leaf = renderLeaf?.(span);
  if (leaf !== undefined) return leaf;
  const tok = (name: string): string => (styled ? ` class="${name}"` : '');
  const tokWith = (name: string, own: string): string => `class="${styled ? `${name} ` : ''}${own}"`;
  switch (span.kind) {
    case 'text':
      return escapeHtml(span.value);
    case 'bold':
      return `<strong${tok('tok-strong')}>${renderSpans(span.children, styled, renderLeaf)}</strong>`;
    case 'italic':
      return `<em${tok('tok-emphasis')}>${renderSpans(span.children, styled, renderLeaf)}</em>`;
    case 'strikethrough':
      return `<s${tok('tok-strike')}>${renderSpans(span.children, styled, renderLeaf)}</s>`;
    case 'highlight':
      return styled
        ? `<span class="tok-highlight">${renderSpans(span.children, styled, renderLeaf)}</span>`
        : `<mark class="cm-table-cell-highlight">${renderSpans(span.children, styled, renderLeaf)}</mark>`;
    case 'code':
      return `<code ${tokWith('tok-code', 'cm-table-cell-code')}>${escapeHtml(span.value)}</code>`;
    case 'wikilink': {
      const resolution = fallbackWikiLinkResolution(span.path, span.alias);
      return `<span class="cm-table-cell-wikilink">${escapeHtml(resolution.displayLabel)}</span>`;
    }
    case 'tag':
      return `<span class="cm-table-cell-tag">#${escapeHtml(span.name)}</span>`;
    case 'date':
      return escapeHtml(span.time === undefined ? span.isoDate : `${span.isoDate}T${span.time}`);
    case 'link':
      return escapeHtml(span.label);
    case 'image':
      return escapeHtml(span.alt);
    case 'embed':
      return escapeHtml(span.path);
  }
}
