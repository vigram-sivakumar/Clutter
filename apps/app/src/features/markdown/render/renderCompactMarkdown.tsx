import type { ReactNode } from 'react';

import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

import { fallbackTagResolution, type ResolveTag } from '../editor/codemirror/tag/tagResolution';
import { fallbackWikiLinkResolution, type ResolveWikiLink } from '../editor/codemirror/wikilink/wikiLinkResolution';
import { tokenizeCompactMarkdown, type CompactSpan } from './tokenizeCompactMarkdown';

import './CompactMarkdown.css';

/**
 * Injected exactly like the page editor's own WikiLink/Tag resolution
 * (`wikiLinkResolution.ts`/`tagResolution.ts`) — same contracts, same
 * "editor/feature layer never imports Vault directly" boundary, reused
 * unchanged rather than a second resolver shape invented for this
 * surface. Omitting a resolver falls back to the same
 * `fallbackWikiLinkResolution`/`fallbackTagResolution` the editor itself
 * falls back to when none is injected.
 */
export interface CompactMarkdownResolvers {
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
}

function renderDate(isoDate: string, key: number): ReactNode {
  // Mirrors DateWidget.ts exactly: a shape-valid-but-calendar-invalid date
  // still renders, as its own raw text, rather than throwing or silently
  // reformatting something meaningless.
  const valid = isValidCalendarDate(isoDate);
  const label = valid ? formatDateDisplay(isoDate, 'compact') : isoDate;

  return (
    <span key={key} className="compact-markdown-date" data-date-status={valid ? 'valid' : 'invalid'}>
      <span className="compact-markdown-date-prefix">@</span>
      {label}
    </span>
  );
}

function renderWikiLink(
  path: string,
  alias: string | null,
  resolveWikiLink: ResolveWikiLink | undefined,
  key: number
): ReactNode {
  const resolution = resolveWikiLink ? resolveWikiLink(path, alias) : fallbackWikiLinkResolution(path);

  return (
    <span key={key} className="compact-markdown-wikilink" data-wikilink-status={resolution.status}>
      {resolution.displayLabel}
    </span>
  );
}

function renderTag(name: string, resolveTag: ResolveTag | undefined, key: number): ReactNode {
  const resolution = resolveTag ? resolveTag(name) : fallbackTagResolution(name);

  return (
    <span key={key} className="compact-markdown-tag" data-tag-status={resolution.status}>
      <span className="compact-markdown-tag-prefix">#</span>
      {resolution.displayLabel}
    </span>
  );
}

function renderCompactSpan(span: CompactSpan, resolvers: CompactMarkdownResolvers, key: number): ReactNode {
  switch (span.kind) {
    case 'text':
      return span.value;
    case 'bold':
      return <strong key={key}>{span.value}</strong>;
    case 'italic':
      return <em key={key}>{span.value}</em>;
    case 'strikethrough':
      return <s key={key}>{span.value}</s>;
    case 'code':
      return (
        <code key={key} className="compact-markdown-code">
          {span.value}
        </code>
      );
    case 'wikilink':
      return renderWikiLink(span.path, span.alias, resolvers.resolveWikiLink, key);
    case 'tag':
      return renderTag(span.name, resolvers.resolveTag, key);
    case 'date':
      return renderDate(span.isoDate, key);
    case 'link':
      return span.label;
    case 'image':
      return span.alt;
  }
}

/**
 * Renders `text` for compact (sidebar-row) display: the same Markdown
 * semantics as the page editor (via `tokenizeCompactMarkdown`), styled
 * with plain semantic HTML instead of CodeMirror decorations/widgets —
 * `<strong>`/`<em>`/`<s>`/`<code>` for the emphasis family, a styled
 * `<span>` for WikiLink/Tag/Date matching the editor's `.tok-*` visual
 * language (`CompactMarkdown.css`) without depending on its
 * `.cm-editor`-scoped selectors.
 *
 * Deliberately has no click/keyboard activation on individual tokens —
 * the sidebar row itself is already the click target for opening the
 * page/task; per-token interaction (open a WikiLink's target, filter by a
 * Tag) is out of scope for this compact surface, consistent with the
 * "intentionally different" list this design was built against.
 */
export function renderCompactMarkdown(text: string, resolvers: CompactMarkdownResolvers = {}): ReactNode {
  const spans = tokenizeCompactMarkdown(text);

  return (
    <span className="compact-markdown">
      {spans.map((span, index) => renderCompactSpan(span, resolvers, index))}
    </span>
  );
}
