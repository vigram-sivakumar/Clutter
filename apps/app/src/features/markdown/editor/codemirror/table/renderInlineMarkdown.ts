import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { tokenizeInline, tokenizeLinkLabel, type InlineSpan, type TokenizeInlineOptions } from '../../../render/inlineSpan';
import { fallbackWikiLinkResolution } from '../wikilink/wikiLinkResolution';
import type { EditorView, WidgetType } from '@codemirror/view';
import { INLINE_CONTENT_CLASS_BY_NODE_NAME, STRIKETHROUGH_PROTECTED_NODE_NAMES, collectActiveInlineClasses, collectActiveStrikeClass, linkContentClasses, type ParticipantResolvers } from '../highlight/inlineLivePreviewParticipants';
import { renderWikiLink } from '../wikilink/wikiLinkDecorations';
import { renderTag } from '../tag/tagDecorations';
import { renderDate } from '../date/dateDecorations';
import { getWikiLinkSourceActivation } from '../wikilink/wikiLinkActivation';
import { wikiLinkEditCaret } from '../wikilink/wikiLinkMouseHandlers';
import { getLinkSourceActivation } from '../link/linkActivation';
import { editorLinkFromNode, type EditorLink } from '../link/linkContextMenu';
import { handleRenderedTokenPress } from '../semanticToken/tokenMouseHandlers';
import { getTagSourceActivation } from '../tag/tagActivation';
import { getDateSourceActivation } from '../date/dateActivation';

interface ProjectedToken {
  readonly activation: () => (() => void) | null;
  readonly editCaret?: number;
  readonly contextLink?: () => EditorLink | null;
}

// Occurrence metadata belongs to the painted leaf, not the cell's label or
// a second editable document. Removed/repainted elements cannot be hits.
const projectedTokens = new WeakMap<Element, ProjectedToken>();

/** Resolve only an actual painted external-link hit, never cell padding or
 * a stale detached widget. The existing context-menu owner builds the payload. */
export function projectedLinkAt(host: HTMLElement, target: Element): EditorLink | null {
  let element: Element | null = target;
  while (element && element !== host && host.contains(element)) {
    const contextLink = projectedTokens.get(element)?.contextLink;
    if (contextLink) return contextLink();
    element = element.parentElement;
  }
  return null;
}

export function handleProjectedTokenPress(
  host: HTMLElement, event: MouseEvent, edit?: (caret: number) => boolean, beforeActivate?: () => void
): boolean {
  let target = event.target instanceof Element ? event.target : null;
  while (target && target !== host && host.contains(target)) {
    const link = projectedTokens.get(target);
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

/** Clipboard HTML for one cell, without editor-only tok-* classes,
 * resolver output or live widgets. On-screen cells use paintInlineMarkdown. */
export function renderInlineMarkdown(text: string): string {
  const tree = sharedMarkdownParser.parse(text);
  const spans = tokenizeInline(tree.topNode, text, undefined, { preserveDestinationlessLinks: true, wikiLinkContext: 'table' });
  return renderSpans(spans, false);
}

type RenderLeaf = (span: InlineSpan) => string | undefined;

function renderSpans(spans: readonly InlineSpan[], styled: boolean, renderLeaf?: RenderLeaf, struck = false): string {
  return spans.map((span) => renderSpan(span, styled, renderLeaf, struck)).join('');
}

/** On-screen projection only. Actual token DOM comes from the same widget
 * factories as Live Preview. No extra EditorView and no HTML serialization
 * of widgets (which would discard their DOM lifecycle). Clipboard stays on
 * renderInlineMarkdown and never receives live widgets or resolver output. */
export function paintInlineMarkdown(
  host: HTMLElement, text: string, view: EditorView, resolvers: Partial<ParticipantResolvers> = {},
): void {
  const tree = sharedMarkdownParser.parse(text);
  const options: TokenizeInlineOptions = { includeSemanticSource: true, includeActivationSource: true, includePresentationSource: true, preserveDestinationlessLinks: true, wikiLinkContext: 'table' };
  const spans = tokenizeInline(tree.topNode, text, undefined, options);
  const nodes: HTMLElement[] = [];
  const renderLeaf: RenderLeaf = span => {
    let widget: WidgetType | null = null;
    const classes = span.activationSource ? collectActiveInlineClasses(span.activationSource) : [];
    if (span.kind === 'wikilink' && span.source !== undefined) {
      widget = renderWikiLink(span.source, resolvers.resolveWikiLink ?? (() => undefined), classes, 'table');
    } else if (span.kind === 'tag' && span.source !== undefined) {
      widget = renderTag(span.source, resolvers.resolveTag ?? (() => undefined), classes);
    } else if (span.kind === 'date' && span.source !== undefined) {
      widget = renderDate(span.source, resolvers.resolveDate ?? (() => undefined), classes);
    } else if (span.kind === 'link') {
      const element = host.ownerDocument.createElement('span');
      const occurrence = span.activationSource;
      const label = occurrence ? tokenizeLinkLabel(occurrence, text, options) : null;
      const strikeClasses = occurrence ? collectActiveStrikeClass(occurrence) : [];
      // Preserve a single strike owner even when the struck label has its
      // own formatting/widget descendants. Underline stays on the title.
      const splitStrike = strikeClasses.length > 0 && label !== null && containsProtectedSpan(label);
      const [outerClass, titleClass] = linkContentClasses(splitStrike ? [] : strikeClasses);
      element.className = outerClass;
      const title = element.appendChild(host.ownerDocument.createElement('span'));
      title.className = titleClass;
      if (label === null) title.textContent = span.label;
      else paintSpans(title, label, splitStrike);
      if (occurrence) projectedTokens.set(element, {
        activation: () => getLinkSourceActivation(tree, (from, to) => text.slice(from, to), occurrence),
        contextLink: () => editorLinkFromNode(occurrence, (from, to) => text.slice(from, to)),
      });
      const index = nodes.push(element) - 1;
      return `<span data-inline-widget="${index}"></span>`;
    } else {
      return undefined;
    }
    if (!widget) {
      if (span.source === undefined) return undefined;
      const raw = escapeHtml(span.source);
      return classes.includes(strikeClass) ? `<span class="${strikeClass}">${raw}</span>` : raw;
    }
    const element = widget.toDOM(view);
    if (span.kind === 'wikilink' && span.source !== undefined && span.activationSource) {
      const raw = span.source;
      projectedTokens.set(element, {
        activation: () => getWikiLinkSourceActivation(raw, resolvers.resolveWikiLink ?? (() => undefined), 'table'),
        editCaret: wikiLinkEditCaret(raw, span.activationSource.to),
      });
    }
    if (span.kind === 'tag' && span.source !== undefined && span.activationSource) {
      const raw = span.source;
      projectedTokens.set(element, {
        activation: () => getTagSourceActivation(raw, resolvers.resolveTag ?? (() => undefined)),
        editCaret: span.activationSource.to,
      });
    } else if (span.kind === 'date' && span.source !== undefined && span.activationSource) {
      const raw = span.source;
      projectedTokens.set(element, {
        activation: () => getDateSourceActivation(raw, resolvers.resolveDate ?? (() => undefined)),
        editCaret: span.activationSource.to,
      });
    }
    const index = nodes.push(element) - 1;
    return `<span data-inline-widget="${index}"></span>`;
  };
  function paintSpans(target: HTMLElement, content: readonly InlineSpan[], struck = false): void {
    target.innerHTML = renderSpans(content, true, renderLeaf, struck);
    for (const placeholder of target.querySelectorAll<HTMLElement>('[data-inline-widget]')) {
      placeholder.replaceWith(nodes[Number(placeholder.dataset.inlineWidget)]!);
    }
  }
  paintSpans(host, spans);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** HTML projection of the existing protected-range ownership rule. A
 * styled container may own the strike itself only when no descendant
 * claims it; otherwise render its children with the same strike intent.
 * Unlike CM6 ranges, nested HTML can express this directly. */
function containsProtectedSpan(spans: readonly InlineSpan[]): boolean {
  return spans.some(span => {
    const source = span.presentationSource ?? span.activationSource;
    return span.kind === 'strikethrough' ||
      (source !== undefined && STRIKETHROUGH_PROTECTED_NODE_NAMES.has(source.name)) ||
      ('children' in span && containsProtectedSpan(span.children));
  });
}

const strikeClass = INLINE_CONTENT_CLASS_BY_NODE_NAME.get('Strikethrough')!;

function renderSpan(span: InlineSpan, styled: boolean, renderLeaf?: RenderLeaf, struck = false): string {
  const leaf = renderLeaf?.(span);
  if (leaf !== undefined) return leaf;
  const classFor = (name: string) => INLINE_CONTENT_CLASS_BY_NODE_NAME.get(name)!;
  const wrapStrike = (html: string) => struck && renderLeaf && html ? `<span class="${strikeClass}">${html}</span>` : html;
  const tok = (name: string): string => (styled ? ` class="${classFor(name)}"` : '');
  const tokWith = (name: string, own: string): string => `class="${styled ? `${classFor(name)}${struck && renderLeaf ? ` ${strikeClass}` : ''} ` : ''}${own}"`;
  const container = (tag: string, name: string, children: readonly InlineSpan[]) => {
    const splitStrike = !!renderLeaf && struck && containsProtectedSpan(children);
    const classes = styled ? ` class="${classFor(name)}${struck && renderLeaf && !splitStrike ? ` ${strikeClass}` : ''}"` : '';
    return `<${tag}${classes}>${renderSpans(children, styled, renderLeaf, splitStrike)}</${tag}>`;
  };
  switch (span.kind) {
    case 'text':
      return wrapStrike(escapeHtml(span.value));
    case 'bold':
      return container('strong', 'StrongEmphasis', span.children);
    case 'italic':
      return container('em', 'Emphasis', span.children);
    case 'strikethrough':
      return renderLeaf
        ? renderSpans(span.children, styled, renderLeaf, true)
        : `<s${tok('Strikethrough')}>${renderSpans(span.children, styled, renderLeaf)}</s>`;
    case 'highlight':
      return styled
        ? container('span', 'Highlight', span.children)
        : `<mark class="cm-table-cell-highlight">${renderSpans(span.children, styled, renderLeaf)}</mark>`;
    case 'code':
      return `<code ${tokWith('InlineCode', 'cm-table-cell-code')}>${escapeHtml(span.value)}</code>`;
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
      return wrapStrike(escapeHtml(span.alt));
    case 'embed':
      return wrapStrike(escapeHtml(span.path));
  }
}
