import { Fragment, type ReactNode } from 'react';

import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

import { fallbackTagResolution, type ResolveTag } from '../editor/codemirror/tag/tagResolution';
import { fallbackWikiLinkResolution, type ResolveWikiLink } from '../editor/codemirror/wikilink/wikiLinkResolution';
import type { ResolvePageEmbed } from './blocks/pageEmbedResolution';
import { tokenizeCompactMarkdown, type CompactSpan } from './tokenizeCompactMarkdown';

import './CompactMarkdown.css';

/**
 * Injected exactly like the page editor's own WikiLink/Tag/embed
 * resolution (`wikiLinkResolution.ts`/`tagResolution.ts`/
 * `pageEmbedResolution.ts`) — same contracts, same "editor/feature layer
 * never imports Vault directly" boundary, reused unchanged rather than a
 * second resolver shape invented for this surface. Omitting a resolver
 * falls back to the same `fallbackWikiLinkResolution`/
 * `fallbackTagResolution` the editor itself falls back to when none is
 * injected; omitting `resolveEmbed` falls back to the embed's own raw
 * target path, the same no-resolver convention.
 */
export interface CompactMarkdownResolvers {
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
  readonly resolveEmbed?: ResolvePageEmbed;
}

/**
 * Strike-ownership class (`.compact-markdown-struck` in `CompactMarkdown.css`) per the Strikethrough Rendering Contract
 * (`apps/app/src/features/markdown/editor/codemirror/highlight/STRIKETHROUGH.md`):
 * a semantic construct that owns its own foreground styling must also own
 * its own `text-decoration-line: line-through` when struck, rather than
 * being left as a descendant of a generic `<s>` — `text-decoration-color`
 * resolves to `currentColor` of *whichever element declares the line*, not
 * of the content it happens to visually cross, so only self-owning gets
 * the line drawn in the construct's own color (verified live: an ancestor
 * `<s>` around a struck `.compact-markdown-code` painted its line in the
 * `<s>`'s own ambient color, not the code's red).
 *
 * Link and WikiLink also carry their own CSS underline, but — mirroring the
 * editor's own `.tok-link`/`.tok-link-title` and `.tok-wikilink`/
 * `.tok-wikilink__title` split (`MarkdownEditor.css`) — that underline lives
 * on a separate inner element (`compact-markdown-link-title`/
 * `-wikilink-title`, `CompactMarkdown.css`), never on the same element as
 * this style. `text-decoration-color`/`-thickness` apply uniformly to every
 * decoration line declared on one element, so composing `line-through` onto
 * the *same* element as an underline tuned for a subtle look would make the
 * strike inherit that underline's alpha color/thickness too — this constant
 * is applied to the outer (color-owning) element only, which never declares
 * its own underline, so it always renders at the default thickness/color
 * like every other construct's strike.
 */
const STRIKE_CLASS = 'compact-markdown-struck';

/** Appends `STRIKE_CLASS` to `base` (or returns it alone / undefined). */
function strikeClass(base: string | undefined, struck: boolean): string | undefined {
  if (!struck) return base;
  return base ? `${base} ${STRIKE_CLASS}` : STRIKE_CLASS;
}

function renderDate(isoDate: string, key: number, struck: boolean): ReactNode {
  // Mirrors DateWidget.ts exactly: a shape-valid-but-calendar-invalid date
  // still renders, as its own raw text, rather than throwing or silently
  // reformatting something meaningless.
  const valid = isValidCalendarDate(isoDate);
  const label = valid ? formatDateDisplay(isoDate, 'compact') : isoDate;

  return (
    <span
      key={key}
      className={strikeClass('compact-markdown-date', struck)}
      data-date-status={valid ? 'valid' : 'invalid'}
    >
      <span className="compact-markdown-date-prefix">@</span>
      {label}
    </span>
  );
}

function renderWikiLink(
  path: string,
  alias: string | null,
  resolveWikiLink: ResolveWikiLink | undefined,
  key: number,
  struck: boolean
): ReactNode {
  const resolution = resolveWikiLink ? resolveWikiLink(path, alias) : fallbackWikiLinkResolution(path);

  return (
    <span
      key={key}
      className={strikeClass('compact-markdown-wikilink', struck)}
      data-wikilink-status={resolution.status}
    >
      <span className="compact-markdown-wikilink-title">{resolution.displayLabel}</span>
    </span>
  );
}

/**
 * Wires the existing `ResolvePageEmbed`/`PageEmbedResolution` resolution
 * semantics (`pageEmbedResolution.ts`, `resolvePageEmbed.ts`) into compact
 * rendering, replacing the previous unconditional `span.path` raw-target
 * display — a confirmed gap, not an intentional prior design (the
 * investigation found no compact-render case ever consulted embed
 * resolution at all). Mirrors `renderWikiLink`'s exact shape: `resolved` ->
 * the target's own resolved title (a whole-page embed's effective name, or
 * `"Page title › Heading"` for a heading-target embed — both computed
 * entirely by the injected resolver, never re-derived here);
 * `ambiguous`/`unresolved`/`unresolved-heading` -> the resolver's own
 * `displayLabel` (already the target's basename, per `resolvePageEmbed.ts`
 * — never the full raw path, never a file extension the resolver itself
 * doesn't expose). No resolver injected at all falls back to the raw
 * target path — the same no-resolver convention `fallbackWikiLinkResolution`
 * establishes, not a second fallback shape.
 *
 * `alias` (the embed's own local `|alias` segment, if any) is deliberately
 * never consulted — `NoteEmbedWidget.ts`'s own `toDOM` never reads it for
 * its title either; only `resolution`'s own title/displayLabel decides
 * what's shown, exactly matching the real editor's established embed
 * rendering.
 */
function renderEmbed(path: string, resolveEmbed: ResolvePageEmbed | undefined): ReactNode {
  if (!resolveEmbed) {
    return path;
  }
  const resolution = resolveEmbed(path);
  return resolution.status === 'resolved' ? resolution.title : resolution.displayLabel;
}

/**
 * Markdown Link, Autolink, and bare URL all tokenize to the same `'link'`
 * span kind (`inlineSpan.ts`) and so share this one rendering case and
 * visual treatment — a real styled `<span>`, not a bare string, using the
 * exact same semantic tokens the editor's `.tok-link`/`.tok-link-title`
 * already use (`--md-link-foreground`/`--md-link-underline`,
 * `CompactMarkdown.css`), never `.tok-link` itself. Deliberately still a
 * `<span>`, never an `<a>` — compact rendering has no click/activation
 * (per this file's own top-level doc comment), so nothing here should
 * look interactive at the DOM-semantics level, only visually styled.
 */
function renderLink(label: string, key: number, struck: boolean): ReactNode {
  return (
    <span key={key} className={strikeClass('compact-markdown-link', struck)}>
      <span className="compact-markdown-link-title">{label}</span>
    </span>
  );
}

function renderTag(name: string, resolveTag: ResolveTag | undefined, key: number, struck: boolean): ReactNode {
  const resolution = resolveTag ? resolveTag(name) : fallbackTagResolution(name);

  return (
    <span
      key={key}
      className={strikeClass('compact-markdown-tag', struck)}
      data-tag-status={resolution.status}
    >
      <span className="compact-markdown-tag-prefix">#</span>
      {resolution.displayLabel}
    </span>
  );
}

/**
 * The span kinds that render their own distinctly-styled element and
 * therefore must own their own strike decoration when struck, per the
 * Strikethrough Rendering Contract's ownership model — never left as a
 * descendant of a generic `<s>` wrapper. `text`/`image`/`embed` are
 * deliberately excluded: none of them render a distinctly-styled element
 * of their own (they're bare strings, per this file's own `image`/`embed`
 * doc comment), so they're indistinguishable from ordinary text for
 * strike-ownership purposes and correctly stay inside the generic `<s>`.
 */
const SELF_STRIKING_KINDS: ReadonlySet<CompactSpan['kind']> = new Set([
  'bold',
  'italic',
  'highlight',
  'code',
  'wikilink',
  'tag',
  'date',
  'link',
]);

/**
 * Renders every span in `spans` in order — the shared entry point both
 * the top-level `renderCompactMarkdown` and each styled container's own
 * `children` (below) call, so a nested `Link`/`WikiLink`/`InlineCode`/
 * another styled container renders through the exact same per-kind
 * switch as a top-level one, composing with its ancestor's own wrapper
 * element via ordinary DOM nesting rather than a parallel rendering path.
 * Never itself struck — `renderStruckChildren` below is the one place
 * that renders a self-striking span with `struck: true`; every other
 * caller (including this one) renders at the default, unstruck state.
 */
function renderCompactSpans(spans: readonly CompactSpan[], resolvers: CompactMarkdownResolvers): ReactNode[] {
  return spans.map((span, index) => renderCompactSpan(span, resolvers, index, false));
}

/**
 * Renders a `Strikethrough` span's own children per the Strikethrough
 * Rendering Contract: **a strike-owning element must never contain
 * another strike-owning element.** Rather than one `<s>` wrapping every
 * child (which would make the ancestor `<s>` the sole owner of
 * `text-decoration-line`, painting its own — usually ambient — color
 * across a semantic child's differently-colored content), this groups
 * consecutive non-self-striking children (`text`/`image`/`embed`) into
 * their own `<s>`, and renders each self-striking child (`SELF_STRIKING_KINDS`)
 * as a sibling with the strike decoration applied directly to its own
 * element (`struck: true`) — mirroring the CodeMirror editor's own
 * gap-splitting exactly in spirit (generic decoration for plain runs,
 * self-owned decoration for semantic constructs), without porting its
 * range/gap machinery: this is a flat array of real sibling React
 * elements, not overlapping CM6 decoration ranges, so there is no
 * `STRIKETHROUGH_PROTECTED_NODE_NAMES`-equivalent to maintain — the
 * `SELF_STRIKING_KINDS` set above *is* the compact-native equivalent,
 * expressed as ordinary span-kind membership rather than Lezer node names.
 *
 * Deliberately scoped to this Strikethrough's own direct children only —
 * a self-striking child's own further children (e.g. a `Link` nested
 * inside a struck `**bold**`) are rendered normally, unstruck, exactly
 * matching the same deliberately-scoped limitation already documented for
 * the editor (`STRIKETHROUGH.md` §17's `~~**[Google](url)**~~` note): the
 * struck `<strong>` still visually shows the strike (it owns its own
 * line), a nested Link inside it does not additionally self-own one. Not
 * redesigning further than the contract's own accepted scope for this.
 */
function renderStruckChildren(children: readonly CompactSpan[], resolvers: CompactMarkdownResolvers): ReactNode[] {
  const nodes: ReactNode[] = [];
  let plainRun: CompactSpan[] = [];
  let key = 0;

  function flushPlainRun(): void {
    if (plainRun.length === 0) {
      return;
    }
    nodes.push(<s key={key++}>{renderCompactSpans(plainRun, resolvers)}</s>);
    plainRun = [];
  }

  for (const child of children) {
    if (SELF_STRIKING_KINDS.has(child.kind)) {
      flushPlainRun();
      nodes.push(renderCompactSpan(child, resolvers, key++, true));
    } else {
      plainRun.push(child);
    }
  }
  flushPlainRun();

  return nodes;
}

function renderCompactSpan(span: CompactSpan, resolvers: CompactMarkdownResolvers, key: number, struck: boolean): ReactNode {
  switch (span.kind) {
    case 'text':
      // Plain text has no element of its own to carry a strike style —
      // struck plain text is always reached via the generic `<s>` in
      // `renderStruckChildren` instead, never with `struck: true` here.
      return span.value;
    case 'bold':
      return (
        <strong key={key} className={strikeClass(undefined, struck)}>
          {renderCompactSpans(span.children, resolvers)}
        </strong>
      );
    case 'italic':
      return (
        <em key={key} className={strikeClass(undefined, struck)}>
          {renderCompactSpans(span.children, resolvers)}
        </em>
      );
    case 'strikethrough':
      // See `renderStruckChildren`'s own doc comment for the full
      // ownership rationale — a `Strikethrough` span never renders a
      // single wrapping element for its whole content; it renders a flat
      // list of siblings, each owning its own strike decoration.
      return <Fragment key={key}>{renderStruckChildren(span.children, resolvers)}</Fragment>;
    case 'highlight':
      return (
        <mark key={key} className={strikeClass('compact-markdown-highlight', struck)}>
          {renderCompactSpans(span.children, resolvers)}
        </mark>
      );
    case 'code':
      return (
        <code key={key} className={strikeClass('compact-markdown-code', struck)}>
          {span.value}
        </code>
      );
    case 'wikilink':
      return renderWikiLink(span.path, span.alias, resolvers.resolveWikiLink, key, struck);
    case 'tag':
      return renderTag(span.name, resolvers.resolveTag, key, struck);
    case 'date':
      return renderDate(span.isoDate, key, struck);
    case 'link':
      return renderLink(span.label, key, struck);
    case 'image':
      return span.alt;
    case 'embed':
      // Compact rendering has no image/PDF display concern at all (see
      // this file's own doc comment) — a resolved embed's own title
      // (or its resolver's basename fallback) is shown as plain text,
      // never an actual image/PDF/note preview. See `renderEmbed`'s own
      // doc comment for the full resolution-fallback chain.
      return renderEmbed(span.path, resolvers.resolveEmbed);
  }
}

/**
 * Renders `text` for compact (sidebar-row) display: the same Markdown
 * semantics as the page editor (via `tokenizeCompactMarkdown`), styled
 * with plain semantic HTML instead of CodeMirror decorations/widgets —
 * `<strong>`/`<em>`/`<s>`/`<code>` for the emphasis family, a styled
 * `<span>` for WikiLink/Tag/Date/Link matching the editor's own semantic
 * color tokens (`--md-wiki-underline`/`--md-tag-foreground`/
 * `--md-date-foreground`/`--md-link-foreground`, `CompactMarkdown.css`)
 * without depending on its `.tok-*`/`.cm-editor`-scoped classes — the
 * same design tokens feed both surfaces, never a second, independently
 * chosen compact palette. Image/Embed stay plain text, deliberately: see
 * this file's own `embed`/`image` cases below for why those two have no
 * inline visual treatment in either surface.
 *
 * Deliberately has no click/keyboard activation on individual tokens —
 * the sidebar row itself is already the click target for opening the
 * page/task; per-token interaction (open a WikiLink's target, filter by a
 * Tag) is out of scope for this compact surface, consistent with the
 * "intentionally different" list this design was built against.
 */
export function renderCompactMarkdown(text: string, resolvers: CompactMarkdownResolvers = {}): ReactNode {
  const spans = tokenizeCompactMarkdown(text);

  return <span className="compact-markdown">{renderCompactSpans(spans, resolvers)}</span>;
}
