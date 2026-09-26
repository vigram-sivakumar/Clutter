import type { EditorState, Range } from '@codemirror/state';
import { Decoration, type WidgetType } from '@codemirror/view';
import type { SyntaxNode, SyntaxNodeRef } from '@lezer/common';

import { renderDate } from '../date/dateDecorations';
import type { ResolveDate } from '../date/dateResolution';
import { renderTag } from '../tag/tagDecorations';
import type { ResolveTag } from '../tag/tagResolution';
import type { ResolveWikiLink } from '../wikilink/wikiLinkResolution';
import { ConcealedMarkerWidget } from './ConcealedMarkerWidget';

/**
 * Declaration of which Markdown constructs participate in inline Live
 * Preview visibility, and how each one renders **when it is not
 * revealed** — per the Inline Live Preview Region ODR
 * (docs/editor-research/inline-live-preview-region-odr-v1.md).
 *
 * ODR §4.5: a participant's renderer owns decoration and visual
 * representation **only**. It never computes, consults, or overrides
 * engagement — by the time a renderer is called, the single authoritative
 * mechanism (`inlineLivePreviewRegion.ts`) has already decided this
 * occurrence renders as preview. A renderer that asked about engagement
 * itself would reintroduce exactly the per-construct decision the ODR
 * exists to eliminate.
 *
 * ODR §4.8: adding a participant is one entry in the map below plus its
 * own renderer. It must never require modifying another participant's
 * entry, renderer, tests, or behavior. That property is the primary
 * acceptance test for this architecture — if a future construct can't be
 * added that way, the design has regressed.
 *
 * ODR §4.7: nothing here may name a *combination* of constructs. Each
 * entry describes one construct in isolation; how two of them compose is
 * decided structurally by the syntax tree, never declared here.
 *
 * Phase 3 scope (ODR §10, as revised) added `WikiLink`, `Tag`, and `Date` —
 * the semantic-token/widget family — reusing `renderTag`/`renderDate`'s
 * existing, unmodified construct-specific logic (scanning, resolution
 * fallback, widget construction) via the `widgetReplaceRenderer` shape
 * below. Per the ODR's locked engaged-region-is-fully-raw-source contract,
 * neither declares an engaged-state renderer — there is no such hook in
 * `ParticipantDecoration` at all, so a widget participant renders nothing
 * (not even styling) while engaged, identical to every other participant.
 * `Task` is deliberately excluded: its checkbox rendering is fused into
 * block-level `listMarkerDecoration.ts`/`'physical-line'` engagement,
 * outside this mechanism's scope per ODR §4.10 — the ODR's own §10 Phase 3
 * text naming `Task` is a recorded erratum, not something implemented here.
 *
 * `WikiLink` is no longer registered here (post-Phase-3): its required
 * behavior — the folder-qualified path must never be visible, in either
 * state — is not an instance of this mechanism's reveal-on-engage contract
 * at all, so it has its own standalone mechanism instead
 * (`wikilink/wikiLinkLivePreview.ts`), entirely independent of this
 * traversal. `resolveWikiLink` stays on `ParticipantResolvers` below,
 * optional and unread, purely so existing call sites that still pass it
 * don't need to change.
 */
export interface ParticipantDecoration {
  readonly decorations: readonly Range<Decoration>[];
  /**
   * Present only for participants whose at-rest form must also be atomic
   * (the widget-replace family) — never present-but-empty for ordinary
   * marker-hiding participants, so "does this participant have atomic
   * ranges" is answered by simple field absence, not a flag to remember
   * to set correctly. Sourced from the *same* renderer call that produced
   * `decorations`, never re-derived by inspecting the merged decoration
   * set afterward (ODR: atomic ranges are participant-owned facts).
   */
  readonly atomic?: readonly Range<Decoration>[];
}

export type ParticipantRenderer = (
  node: SyntaxNodeRef,
  state: EditorState
) => ParticipantDecoration;

/**
 * Renderer for a construct whose source form is `<mark>content<mark>` —
 * exactly two same-named delimiter children with the styled content
 * between them. Classes the content; marker handling depends on
 * `markerClass` (see below).
 *
 * This factory takes **one** construct's own facts (its delimiter node
 * name, its content class); it encodes no relationship between
 * constructs. It exists because the three Phase 1 participants genuinely
 * share this one shape, not as a general assumption that every future
 * participant will — a widget-replaced construct (Phase 3) will register
 * a completely different `ParticipantRenderer` without touching this.
 *
 * Logic migrated unchanged from the retired `emphasisLivePreview.ts` /
 * `strikethroughLivePreview.ts`, which each inlined this same shape.
 * `firstChild`/`lastChild` reliably resolve the two delimiter runs for
 * all three node kinds (each always parses with exactly two mark children
 * and nothing else of its own); the name check is a guard against a stale
 * tree, in which case nothing is decorated this pass and the next reparse
 * corrects it.
 *
 * **`markerClass` (2026-08-27, `Decoration.replace()`-with-widget
 * concealment — see docs/editor-architecture-decisions.md's entry of that
 * name for the full investigation, including the two rejected CSS-only
 * predecessors that both lived on this same `Decoration.mark` path):**
 * when provided, marker ranges are concealed via `Decoration.replace()`
 * with a `ConcealedMarkerWidget` — an empty, independently-styled box, not
 * the marker's own real glyphs. This is a change *from* an earlier
 * version of this same factory, which kept the marker's real text in the
 * DOM as a `Decoration.mark` and concealed it purely via CSS on the
 * shared `cm-marker--concealed` class; that approach could not
 * simultaneously get zero horizontal layout width and non-degenerate
 * vertical geometry right (see the doc entry for the measured failure
 * mode of each CSS variant tried). `ConcealedMarkerWidget`'s own DOM
 * element still carries `cm-marker`/`cm-{construct}-marker`/
 * `cm-marker--concealed` for continuity with existing per-construct
 * concealed-marker queries, but contains no text, and blockquote's
 * separate `color: transparent` technique (which deliberately does
 * reserve real gutter width) is unaffected by any of this — see that
 * construct's own decoration source. When `markerClass` is omitted
 * (Autolink's current registration), marker ranges keep the original bare
 * `Decoration.replace({})` behavior completely unchanged — this migration
 * is deliberately scoped to the five constructs that pass one;
 * Autolink/Link/WikiLink are out of scope for this slice (see the
 * agreement's §7.1 ordering) and must not be affected by this factory
 * change merely because they share it.
 */
function delimitedInlineRenderer(
  markNodeName: string,
  contentClass: string,
  markerClass?: string
): ParticipantRenderer {
  return (node) => {
    const openMark = node.node.firstChild;
    const closeMark = node.node.lastChild;
    if (
      !openMark ||
      openMark.name !== markNodeName ||
      !closeMark ||
      closeMark.name !== markNodeName
    ) {
      return { decorations: [] };
    }

    const markerDecoration = markerClass
      ? Decoration.replace({ widget: new ConcealedMarkerWidget(markerClass) })
      : Decoration.replace({});

    const decorations: Range<Decoration>[] = [
      markerDecoration.range(openMark.from, openMark.to),
    ];
    // An empty construct (`****`) has its two marks adjacent, with no
    // content range between them to class.
    if (openMark.to < closeMark.from) {
      // inclusiveStart/inclusiveEnd: true — required so this mark visually
      // wraps a nested widget-replace participant (WikiLink/Tag/Date)
      // whose range exactly fills the content range (the ordinary
      // zero-gap-nesting case, e.g. `**[[Page]]**`). CM6's mark
      // decorations default to non-inclusive boundaries, and a
      // non-inclusive mark does not extend its wrapping `<span>` across a
      // widget point sitting at/through its span — confirmed by direct
      // A/B DOM inspection, not assumed: without these flags, `**[[Page]]**`
      // rendered the WikiLink widget as a plain sibling with no `tok-strong`
      // wrapper at all. Ordinary (non-widget) content is unaffected: plain
      // text and concealed zero-width marker ranges compose into this mark
      // the same way regardless of inclusivity, so this is purely additive.
      const classes = [contentClass, ...collectActiveStrikeClass(node)].join(
        ' '
      );
      decorations.push(
        Decoration.mark({
          class: classes,
          inclusiveStart: true,
          inclusiveEnd: true,
        }).range(openMark.to, closeMark.from)
      );
    }
    decorations.push(markerDecoration.range(closeMark.from, closeMark.to));
    return { decorations };
  };
}

/**
 * Node names whose own decoration must never sit under an *ancestor*
 * `.tok-strike` mark — see `strikethroughRenderer`'s own doc comment for
 * the full reasoning (in short: `Link`/`Autolink`'s `tok-link` declares its
 * own `text-decoration`, so an ancestor `.tok-strike` propagating into it
 * is the WKWebView compositing bug this exists to structurally avoid;
 * `URL` reuses the same `tok-link` class for the same reason).
 */
const STRIKETHROUGH_PROTECTED_NODE_NAMES: ReadonlySet<string> = new Set([
  'Link',
  'Autolink',
  'URL',
]);

/**
 * Depth-first walk of a `Strikethrough` node's own subtree (the same
 * `cursor()`-based traversal shape the retired subtree-walking
 * `revealedMarkerRanges` used to use, before it was superseded by the
 * single-node `revealedMarkNodeRanges`, below — this function still needs
 * a genuine subtree walk since it collects every descendant `Link` at any
 * depth, unlike that one) — reused because it already correctly handles
 * arbitrary nesting depth,
 * e.g. a `Link` inside `StrongEmphasis` inside `Strikethrough`), collecting
 * the document-offset range of every descendant `Link`/`Autolink`/`URL`
 * node, at any depth. Ranges, not DOM/decoration objects — the gap
 * computation this feeds is purely a document-offset calculation,
 * independent of how CM6 later renders it.
 *
 * Does not skip descending into a found node's own children (e.g. a
 * `Link`'s nested `URL` child) — the `URL` found that way is always fully
 * contained within its parent `Link`'s already-collected range, so it's
 * redundant but harmless; `mergeProtectedRanges` collapses it away rather
 * than this function needing to track "have I already found an ancestor
 * protected node" itself.
 *
 * Does skip descending into `Image` — an Image's own destination is parsed
 * as a nested `URL` node (`![alt](url)` is structurally a `Link` sibling
 * shape: `LinkMark URL LinkMark`), but that `URL` isn't rendered via
 * `tok-link`/`linkContentDecorations` at all (`imageLivePreview.ts` widget-
 * replaces the whole `Image` node instead), so it has no text-decoration
 * conflict to protect against. Treating it as protected anyway produced a
 * real bug: for a Strikethrough whose entire content is one Image (e.g.
 * `~~![alt](url)~~`), the "protected" URL span covers nearly the whole
 * range, leaving only slivers before/after it — both of which fall inside
 * the Image widget's own replaced range and so never render, making
 * `.tok-strike` disappear entirely instead of wrapping the image.
 */
function collectProtectedLinkRanges(
  root: SyntaxNode
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  const cursor = root.cursor();
  let hasNext = true;
  do {
    if (STRIKETHROUGH_PROTECTED_NODE_NAMES.has(cursor.name)) {
      ranges.push({ from: cursor.from, to: cursor.to });
    }
    hasNext = cursor.next(cursor.name !== 'Image');
  } while (hasNext && cursor.from < root.to);
  return ranges;
}

/**
 * Sorts and merges overlapping/nested/touching ranges into the minimal
 * disjoint set covering the same total span — standard interval-merge,
 * needed because `collectProtectedLinkRanges` can return nested duplicates
 * (a `Link`'s own range plus its `URL` child's range, both protected) or,
 * in principle, adjacent unrelated protected nodes with no gap between
 * them (`[a](u)[b](u)`, zero characters apart).
 */
function mergeProtectedRanges(
  ranges: readonly { from: number; to: number }[]
): { from: number; to: number }[] {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: { from: number; to: number }[] = [{ ...sorted[0]! }];
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * The complement of `protectedRanges` within `[from, to)` — the sub-ranges
 * `strikethroughRenderer` should still class `tok-strike`, having carved
 * out every protected (`Link`/`Autolink`/`URL`) descendant. `protectedRanges`
 * must already be sorted and disjoint (i.e. already passed through
 * `mergeProtectedRanges`) — this function doesn't re-sort or re-merge.
 *
 * Each gap also reports, per edge, whether that edge sits at the
 * `Strikethrough` construct's own outer boundary (`from`/`to`) or abuts a
 * protected range instead — `strikethroughRenderer` needs this to decide
 * `inclusiveStart`/`inclusiveEnd` per gap, not just per call. An edge at
 * the construct's own boundary still needs to be inclusive, exactly like
 * `delimitedInlineRenderer`'s single mark always was, so a gap mark can
 * still visually wrap a widget-replace participant (WikiLink/Tag/Date)
 * sitting exactly at that boundary. An edge that abuts a protected range
 * must NOT be inclusive: confirmed live via a real reproduced bug
 * (`~~**[Google](url)**~~`) — an inclusive edge there doesn't just "wrap a
 * zero-width widget sitting in the gap," it also absorbs the *adjacent*
 * `Link` mark that starts/ends exactly at that same position into becoming
 * a child of this gap's own span, recreating the exact ancestor
 * relationship this whole mechanism exists to avoid.
 */
function computeStrikethroughGaps(
  from: number,
  to: number,
  protectedRanges: readonly { from: number; to: number }[]
): { from: number; to: number; inclusiveStart: boolean; inclusiveEnd: boolean }[] {
  const gaps: { from: number; to: number; inclusiveStart: boolean; inclusiveEnd: boolean }[] = [];
  let cursor = from;
  let cursorAtOuterBoundary = true;
  for (const protectedRange of protectedRanges) {
    if (cursor >= to) {
      break;
    }
    if (protectedRange.from > cursor) {
      gaps.push({
        from: cursor,
        to: Math.min(protectedRange.from, to),
        inclusiveStart: cursorAtOuterBoundary,
        inclusiveEnd: false,
      });
    }
    cursor = Math.max(cursor, protectedRange.to);
    cursorAtOuterBoundary = false;
  }
  if (cursor < to) {
    gaps.push({
      from: cursor,
      to,
      inclusiveStart: cursorAtOuterBoundary,
      inclusiveEnd: true,
    });
  }
  return gaps;
}

/**
 * Dedicated `Strikethrough` renderer — replaces this one construct's
 * former shared `delimitedInlineRenderer('StrikethroughMark', 'tok-strike',
 * 'cm-strike-marker')` registration. Marker concealment (`~~`/`~~`) is
 * unchanged, copied verbatim from that factory. The one thing this changes:
 * where `delimitedInlineRenderer` emits *one* `tok-strike` mark spanning
 * the entire content range, this emits one `tok-strike` mark per *gap*
 * between `Link`/`Autolink`/`URL` descendants, and none at all over their
 * own ranges.
 *
 * Why: `.tok-link`'s own `text-decoration` (the underline) conflicts with
 * an ancestor `.tok-strike`'s propagated `line-through` the moment both
 * apply to the same element — and WKWebView doesn't reliably composite two
 * overlapping decorating boxes even when a descendant's own is given an
 * independent color/thickness to try to win that conflict (confirmed live
 * in the real Tauri app: a stray line was visible despite every computed
 * style being exactly correct — see this repo's own investigation
 * history). CSS has no standards-compliant way to sever ancestor/descendant
 * `text-decoration` propagation without making the descendant atomic
 * (`inline-block`/`inline-flex`), which breaks natural wrapping for long
 * link labels (confirmed live, rejected).
 *
 * The fix implemented here is structural, not visual: make the link a
 * **sibling** of `.tok-strike`, never its descendant, by construction —
 * and, since the link is never inside a `.tok-strike` context anymore, it
 * never needs to *own* any strikethrough styling of its own either.
 * `<span class="tok-strike">before </span><span class="tok-link">...</span>
 * <span class="tok-strike"> after</span>` has no ancestor `.tok-strike` for
 * anything to propagate from in the first place — the WKWebView compositing
 * bug has nothing to trigger on, root cause removed rather than mitigated.
 * A struck link therefore renders with no strikethrough line across its
 * own text at all (only the surrounding plain text shows one) — a
 * deliberate trade of "visually complete struck-link appearance" for
 * "zero decoration ownership overlap, zero engine-compositing risk."
 * `linkRenderer`/`urlRenderer`/`autolinkRenderer` are completely untouched
 * by *this* function: they never ask "am I struck" at all anymore (see
 * `linkContentDecorations`'s own doc comment) — only `Strikethrough`'s own
 * participant needed to change.
 *
 * Every other struck construct (plain text, `Tag`, `WikiLink`, `InlineCode`,
 * `StrongEmphasis`/`Emphasis`/`Highlight` wrapping non-link content) is
 * unaffected: `STRIKETHROUGH_PROTECTED_NODE_NAMES` excludes only
 * `Link`/`Autolink`/`URL`, so their content still falls inside a gap and
 * still receives `tok-strike` exactly as before. A `Link` nested inside
 * `StrongEmphasis`/`Emphasis`/`Highlight` inside a `Strikethrough` (e.g.
 * `~~**[Google](url)**~~`) is unaffected in the other direction too:
 * `StrongEmphasis`'s own registered participant still wraps the *entire*
 * `**...**` content — including the link — in its own `tok-strong` mark,
 * completely independently of this function, since `.tok-strong` declares
 * no `text-decoration` and has no conflict to avoid. Only `Strikethrough`'s
 * own decoration needed splitting.
 */
const strikethroughRenderer: ParticipantRenderer = (node) => {
  const strikeNode = node.node;
  const openMark = strikeNode.firstChild;
  const closeMark = strikeNode.lastChild;
  if (
    !openMark ||
    openMark.name !== 'StrikethroughMark' ||
    !closeMark ||
    closeMark.name !== 'StrikethroughMark'
  ) {
    return { decorations: [] };
  }

  const markerDecoration = Decoration.replace({
    widget: new ConcealedMarkerWidget('cm-strike-marker'),
  });
  const decorations: Range<Decoration>[] = [
    markerDecoration.range(openMark.from, openMark.to),
  ];

  if (openMark.to < closeMark.from) {
    const protectedRanges = mergeProtectedRanges(
      collectProtectedLinkRanges(strikeNode)
    );
    const gaps = computeStrikethroughGaps(
      openMark.to,
      closeMark.from,
      protectedRanges
    );
    const classes = ['tok-strike', ...collectActiveStrikeClass(node)].join(' ');
    for (const gap of gaps) {
      // inclusiveStart/inclusiveEnd are per-gap, not blanket true — see
      // computeStrikethroughGaps's own doc comment for why: true only on
      // an edge that sits at this Strikethrough's own outer boundary
      // (needed to still wrap a widget-replace participant, e.g. WikiLink,
      // sitting exactly at that edge), false on an edge that abuts a
      // protected Link/Autolink/URL range (an inclusive edge there would
      // absorb the adjacent link into becoming this mark's own child).
      decorations.push(
        Decoration.mark({
          class: classes,
          inclusiveStart: gap.inclusiveStart,
          inclusiveEnd: gap.inclusiveEnd,
        }).range(gap.from, gap.to)
      );
    }
  }
  decorations.push(markerDecoration.range(closeMark.from, closeMark.to));
  return { decorations };
};

/**
 * Structural (not name-based) test for "does this node parse as an
 * ordinary delimited-mark construct" — exactly two children whose own
 * name is identical and ends in `Mark`, bracketing the content. Every
 * `delimitedInlineRenderer` participant (Emphasis, StrongEmphasis,
 * Strikethrough, Highlight, InlineCode, Autolink) and `Link` itself
 * (whose own `firstChild`/`lastChild` are both `LinkMark`, per
 * `linkRenderer`'s own doc comment) satisfy this by construction; ordinary
 * block containers (Paragraph, Document, ListItem, TableCell, ...) never
 * do, so a walk built on this check naturally stops at a paragraph
 * boundary without needing to name any container type.
 *
 * Originally local to `wikiLinkLivePreview.ts` (`widenToEnclosingLivePreviewRegion`'s
 * own engagement-boundary walk); promoted here, unchanged, so
 * `collectActiveInlineClasses` below can reuse the identical structural
 * fact rather than re-deriving or duplicating it.
 */
export function isDelimitedMarkConstruct(node: SyntaxNode): boolean {
  const first = node.firstChild;
  const last = node.lastChild;
  return (
    !!first &&
    !!last &&
    first !== last &&
    first.name === last.name &&
    first.name.endsWith('Mark')
  );
}

/**
 * The rendered CSS class each delimited-mark construct's own content
 * carries — the exact same class each one's own `delimitedInlineRenderer`/
 * `linkRenderer` registration below already passes as `contentClass`.
 * Kept as one small lookup, rather than re-deriving it from the
 * registration closures (which erase this fact once built), so
 * `collectActiveInlineClasses` can answer "what class does this ancestor
 * contribute" without executing or inspecting a renderer.
 */
const INLINE_CONTENT_CLASS_BY_NODE_NAME: ReadonlyMap<string, string> = new Map([
  ['Emphasis', 'tok-emphasis'],
  ['StrongEmphasis', 'tok-strong'],
  ['Strikethrough', 'tok-strike'],
  ['Highlight', 'tok-highlight'],
  ['InlineCode', 'tok-code'],
  ['Link', 'tok-link'],
  ['Autolink', 'tok-link'],
]);

/**
 * Inline-formatting composition for widget-family constructs (WikiLink,
 * Tag, Date, and any future inline widget): walks a node's ancestors and
 * collects the content class of every enclosing delimited-mark construct,
 * innermost first, stopping at the first ancestor that doesn't structurally
 * qualify (`isDelimitedMarkConstruct`) — the same termination `widenToEnclosingLivePreviewRegion`
 * already relies on.
 *
 * Per docs/editor-architecture-decisions.md's "Inline formatting
 * composition at the token level": a widget-family participant applies
 * these classes directly onto its own rendered root element (alongside its
 * own `tok-*` class), so an ancestor's CSS (e.g. `.tok-strike`'s
 * `text-decoration-line`) is declared on — and therefore painted by — the
 * widget's own element, never relied upon to propagate in from outside.
 * This is why it works regardless of nesting depth
 * (`~~==**[[Note]]**==~~`), order (`**~~[[Note]]~~**` vs `~~**[[Note]]**~~`),
 * or whether the widget is an atomic (`display: inline-flex`) box: nothing
 * here asks CSS to cross an element boundary at all.
 *
 * Deliberately pure and tree-only — no `EditorState`/`EditorView` parameter,
 * no knowledge of engagement, selection, or any other state source (e.g.
 * completed-task line state, which is a *different*, independently-solved
 * concern — see `docs/editor-architecture-decisions.md`). Adding a new
 * delimited-mark construct never requires touching this function: it only
 * needs a `contentClass` entry above, the same one its own participant
 * registration already needs.
 */
export function collectActiveInlineClasses(
  node: SyntaxNodeRef
): readonly string[] {
  const classes: string[] = [];
  let ancestor = node.node.parent;
  while (ancestor && isDelimitedMarkConstruct(ancestor)) {
    const contentClass = INLINE_CONTENT_CLASS_BY_NODE_NAME.get(ancestor.name);
    if (contentClass) {
      classes.push(contentClass);
    }
    ancestor = ancestor.parent;
  }
  return classes;
}

/**
 * First slice of extending token-level class composition
 * (`collectActiveInlineClasses`, above) from the widget-family renderers to
 * the plain `Decoration.mark` participants (Emphasis, StrongEmphasis,
 * Strikethrough itself, Highlight, InlineCode, Link, Autolink, URL) —
 * `tok-strike` only, deliberately, per the scoped request that introduced
 * this: composing every ancestor class onto every `Decoration.mark` span is
 * a broader change than what's asked for here, so this stays a filter over
 * the existing, unmodified `collectActiveInlineClasses` rather than a new
 * traversal. Widget-family renderers (`widgetReplaceRenderer`,
 * `wikiLinkLivePreview.ts`) already compose the full `collectActiveInlineClasses`
 * result and are untouched by this — this helper exists only for the
 * `Decoration.mark` call sites below, which previously composed no ancestor
 * classes at all.
 */
function collectActiveStrikeClass(node: SyntaxNodeRef): readonly string[] {
  return collectActiveInlineClasses(node).filter((cls) => cls === 'tok-strike');
}

/**
 * `Link`/`URL`/`Autolink` content mirrors `WikiLinkWidget.ts`'s own
 * outer/inner ownership split exactly, not a link-specific invention:
 * `.tok-wikilink` (outer) owns `color` and composes `tok-strike` onto
 * itself when struck; `.tok-wikilink__title` (inner) owns only the
 * underline. That split works with zero conflict because `color` is an
 * *inherited* CSS property (set once on the outer, reaches the inner for
 * free) while `text-decoration-line`/`-color`/`-thickness` are not — two
 * *different* elements each declaring their own `text-decoration` never
 * fight over one element's single `text-decoration-line` value the way
 * one element's `underline` shorthand would against `.tok-strike`'s
 * `line-through` one (confirmed live: composing `tok-strike` onto a single
 * `.tok-link` that also declares its own underline reintroduces exactly
 * that conflict — the split exists specifically to avoid it).
 *
 * `tok-link` (outer, this function's first mark) owns `color` + composes
 * `tok-strike` when `strikeClasses` is non-empty; `tok-link-title` (inner,
 * second mark) owns the underline exclusively (`MarkdownEditor.css`: same
 * shape as `.tok-wikilink__title` — thickness, offset — with the link's
 * own `--md-link-underline` color token instead of wiki's).
 *
 * This alone would still be wrong without `strikethroughRenderer`'s own
 * fix (below): composing `tok-strike` onto the link's own root only avoids
 * a *conflict* if the link is never *also* wrapped by an ancestor
 * `.tok-strike` from `Strikethrough`'s own decoration — otherwise the
 * ancestor's separate, differently-`currentColor`'d propagated line and
 * this self-composed one are two competing decorating boxes on the same
 * text again, the exact WKWebView compositing bug this whole mechanism
 * exists to avoid. `strikethroughRenderer` splits its own ranges around
 * `Link`/`Autolink`/`URL` descendants specifically so no such ancestor
 * ever exists — the two fixes are complementary, not alternatives: this
 * one gives the link a *single, self-owned* decorating box for its
 * strikethrough (matching WikiLink); that one guarantees no second,
 * ancestor-owned one ever coexists with it.
 *
 * Getting CM6 to nest the two marks in that specific order (`tok-link`
 * outer, `tok-link-title` inner) is not a matter of push order — a real,
 * reproduced bug (documented on the retired `tok-link`/`tok-link-strike`
 * version of this same split, recoverable from history) proved push order
 * alone is a traversal-dependent tie, not a control mechanism, when both
 * marks share the same `inclusiveStart`/`inclusiveEnd`. The fix is the
 * same one used there: give the two marks different, non-tied CM6 sort
 * keys via those flags — `tok-link`/`tok-strike` always inclusive (opens
 * first, closes last: always outer), `tok-link-title` always non-inclusive
 * (always inner).
 */
function linkContentDecorations(
  from: number,
  to: number,
  strikeClasses: readonly string[]
): Range<Decoration>[] {
  const outerClass = ['tok-link', ...strikeClasses].join(' ');
  return [
    Decoration.mark({ class: outerClass, inclusiveStart: true, inclusiveEnd: true }).range(from, to),
    Decoration.mark({ class: 'tok-link-title' }).range(from, to),
  ];
}

/**
 * Which node names are marker-contract constructs for the *engaged*
 * marker reveal (`revealedMarkNodeRanges` below), and which node name each
 * one's own direct marker children carry. Deliberately explicit and
 * construct-scoped — never "any node whose name ends in `Mark`" — so
 * block-level mark owners (`HeaderMark`/`QuoteMark`/`ListMark`/
 * `TaskMarker`, each owned by its own line-scoped decoration source:
 * `headingMarkerDecoration.ts`/`blockquoteMarkerDecoration.ts`/
 * `listMarkerDecoration.ts`) are structurally unreachable here, not just
 * excluded by convention. Originally scoped to exactly the five constructs
 * first migrated to the marker-DOM contract (docs/markdown-dom-structure-
 * agreement.md §7.1's first slice); extended to `Link`/`Autolink` once the
 * marker-color audit confirmed both already parse with real `LinkMark`
 * child nodes (`[label](url)` → `LinkMark, ...label..., LinkMark, LinkMark,
 * URL, LinkTitle?, LinkMark` — confirmed directly against
 * `@lezer/markdown`'s own `finishLink` source) — this loop already walks
 * "however many direct children carry the registered mark node name," so
 * no new logic was needed, only registration. Adding a construct is one
 * entry in this map, same shape as the `participants` map itself; it never
 * requires touching another construct's entry.
 */
const MARKER_CONSTRUCTS: ReadonlyMap<
  string,
  { readonly markNodeName: string; readonly markerClass: string }
> = new Map([
  [
    'Emphasis',
    { markNodeName: 'EmphasisMark', markerClass: 'cm-emphasis-marker' },
  ],
  [
    'StrongEmphasis',
    { markNodeName: 'EmphasisMark', markerClass: 'cm-strong-marker' },
  ],
  [
    'Strikethrough',
    { markNodeName: 'StrikethroughMark', markerClass: 'cm-strike-marker' },
  ],
  [
    'Highlight',
    { markNodeName: 'HighlightMark', markerClass: 'cm-highlight-marker' },
  ],
  ['InlineCode', { markNodeName: 'CodeMark', markerClass: 'cm-code-marker' }],
  ['Link', { markNodeName: 'LinkMark', markerClass: 'cm-link-marker' }],
  ['Autolink', { markNodeName: 'LinkMark', markerClass: 'cm-link-marker' }],
]);

/**
 * Reveals one engaged marker-contract construct's own direct marker
 * children as `cm-marker cm-{construct}-marker` spans, with no
 * `--concealed` modifier — engaged is the one state an inline marker is
 * actually visible in, so it's the one state `--md-marker-foreground`
 * needs to reach. A no-op (returns `[]`) for any node whose name isn't a
 * key in `MARKER_CONSTRUCTS` (the widget-replace family — Tag/Date — and
 * bare `URL`, none of which have markers of their own to reveal).
 *
 * **Single-node, not a subtree walk — corrected 2026-09-26 (nested-inline-
 * rendering generic fix, see docs/editor-architecture-decisions.md's
 * correction of that name).** Superseded the previous `revealedMarkerRanges`,
 * which walked an *entire* engaged region's subtree and revealed every
 * nested marker-contract construct's marks unconditionally — correct only
 * because `inlineLivePreviewRegion.ts`'s traversal used to `return false`
 * at the engaged root, meaning that subtree walk was the *only* pass ever
 * reaching descendants at all. Once that traversal stopped short-circuiting
 * (so nested constructs — WikiLink, Tag, Link, and ordinary marker
 * constructs alike — resolve their own engagement independently instead of
 * inheriting "raw" from an ancestor), a whole-subtree marker reveal would
 * have re-introduced exactly the bug this fix removes: a sibling
 * marker-contract construct nested inside an engaged ancestor (e.g. the
 * un-engaged `**b**` in `~~**a** and **b**~~` with the caret in `**a**`)
 * would have had its own `**` marks force-revealed too, even though the
 * caret never touched it. This function is called once per participant
 * node that `inlineLivePreviewRegion.ts`'s own traversal determines is
 * engaged (bare range or flush-widened, see
 * `tokenEngagement.ts`'s `widenThroughFlushAncestors`) — each engaged
 * ancestor in a nesting chain reveals its own marks via its own call,
 * exactly the same way `***bold italic***` engaged at "bold" still reveals
 * both the outer `Emphasis` and the inner `StrongEmphasis` marks: both
 * nodes are independently, genuinely engaged (the caret sits within both
 * nodes' own ranges), not because one subtree walk found both from a
 * single root.
 */
export function revealedMarkNodeRanges(
  node: SyntaxNode
): readonly Range<Decoration>[] {
  const spec = MARKER_CONSTRUCTS.get(node.name);
  if (!spec) {
    return [];
  }
  const decoration = Decoration.mark({
    class: `cm-marker ${spec.markerClass}`,
  });
  const ranges: Range<Decoration>[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === spec.markNodeName) {
      ranges.push(decoration.range(child.from, child.to));
    }
  }
  return ranges;
}

/**
 * Renderer for a construct whose at-rest form is the *entire* node
 * replaced by one widget — the semantic-token/widget family (`WikiLink`,
 * `Tag`, `Date`). Unlike `delimitedInlineRenderer`, the single replace
 * range doubles as both the visible decoration and the atomic-range
 * fact: at rest, a widget-family occurrence must be both rendered as a
 * widget *and* untouchable by a single Backspace/Delete/cursor-motion
 * step, and both facts come from the exact same range because they
 * describe the exact same at-rest occurrence — there is never a case
 * where one applies without the other.
 *
 * `render` receives the node's raw matched text plus the composed set of
 * extra classes this occurrence should carry — `collectActiveInlineClasses(node)`
 * (its enclosing delimited-mark ancestors) — which every renderer
 * registered through this factory (`renderWikiLink`/`renderTag`/
 * `renderDate`) threads straight into its widget's constructor so the
 * widget's own root element carries every applicable class directly (see
 * `collectActiveInlineClasses`'s own doc comment for why it's a
 * self-contained, syntax-tree-only state source). Nothing else about
 * `node`/`view` is needed (confirmed by inspecting each), so this factory
 * doesn't thread through anything else.
 *
 * **Deliberately excludes `TASK_COMPLETED_CLASS` (removed 2026-09-13).**
 * This factory used to also compose `TASK_COMPLETED_CLASS` in here,
 * independently, whenever `isNodeOnCompletedTask` (`taskEngagement.ts`)
 * said the occurrence sat on a checked task line — putting the class on
 * the widget's own root *in addition to* `taskCompletedContentDecoration.ts`'s
 * ancestor `Decoration.mark`, which already wraps the widget in the real
 * editor. Two nested elements carrying the same class for one logical
 * occurrence compounds `opacity`/`color-mix(... currentColor ...)`-style
 * styling in a way plain CSS specificity can't resolve, so the ancestor
 * mark is now the sole source of `cm-task-completed` for every construct,
 * including this widget family.
 */
function widgetReplaceRenderer(
  render: (raw: string, extraClasses: readonly string[]) => WidgetType | null
): ParticipantRenderer {
  return (node, state) => {
    const extraClasses = [...collectActiveInlineClasses(node)];
    const widget = render(state.sliceDoc(node.from, node.to), extraClasses);
    if (!widget) {
      return { decorations: [] };
    }
    const range = Decoration.replace({ widget }).range(node.from, node.to);
    return { decorations: [range], atomic: [range] };
  };
}

/**
 * Renderer for `Link` (`[label](url "title")`) — conceals the Markdown
 * syntax while keeping the label ordinary, character-editable text; never
 * atomic. Per docs/editor-architecture-decisions.md's "Shared live-preview
 * participant contract — confirmed via Link": `Link`'s contract is "hide
 * syntax, keep the visible content editable, reveal everything when
 * engaged" — the same contract every `delimitedInlineRenderer` participant
 * already implements — so it belongs here, in the shared `Decoration.set()`,
 * not as a standalone extension the way WikiLink is (WikiLink's contract is
 * genuinely different: it must conceal part of its content even while
 * engaged, which this shared "engaged region → fully raw source" contract
 * cannot express at all).
 *
 * Not `delimitedInlineRenderer`: that helper's `firstChild`/`lastChild`
 * precondition assumes a 2-same-named-child shape. `Link`'s own
 * `firstChild`/`lastChild` are the opening `[` and the *final* closing `)`
 * of the destination — the range between them is the label **plus**
 * `](url "title")`, not just the label. What's actually needed is the
 * FIRST TWO `LinkMark` children specifically (the opening `[` and the
 * label-closing `]`) — confirmed against the real parse, including with
 * nested formatting and a nested WikiLink inside the label (both parse as
 * ordinary child nodes between those two marks, recursively parsed exactly
 * like any other inline content). Everything from the label-closing `]`
 * through the node's own end is concealed as one combined range regardless
 * of internal shape (`URL`, optional `LinkTitle`, closing `)` are never
 * independently visible at rest) — deliberately not decomposed further.
 *
 * Reference-style/shortcut links (`[text][ref]`, `[text][]`, bare
 * `[text]`) parse to this exact same `Link` node type but with no `URL`
 * child (a `LinkLabel` child, or nothing, instead) — confirmed identical
 * whether or not a matching `LinkReference` definition exists elsewhere in
 * the document, so the tree alone can never say whether such a link
 * actually resolves. This renderer requires a `URL` child to be present at
 * all; without one, it decorates nothing and the text stays fully raw —
 * a deliberate scope boundary (real reference resolution is separate,
 * larger scope), not an oversight.
 *
 * **Empty label (`[](url)`) falls back to displaying the URL itself.**
 * Rather than concealing the entire construct (which would make it
 * disappear at rest with nothing to click or read), the URL child's own
 * range is left as ordinary visible content — classed `tok-link`, exactly
 * like a non-empty label — and only the surrounding syntax (`[`, `](`, and
 * `)`/optional title) is concealed. The URL text rendered at rest is the
 * real document text at its own real position, not a synthesized/widget
 * label, so no new concealment or widget machinery is introduced — this is
 * the same "conceal marks, class the content between them" shape as the
 * non-empty branch, just with the URL node standing in for the label.
 */
const linkRenderer: ParticipantRenderer = (node) => {
  const linkNode = node.node;
  const marks: SyntaxNode[] = [];
  let urlNode: SyntaxNode | null = null;
  for (let child = linkNode.firstChild; child; child = child.nextSibling) {
    if (child.name === 'LinkMark' && marks.length < 2) {
      marks.push(child);
    } else if (child.name === 'URL' && !urlNode) {
      urlNode = child;
    }
  }

  const [openMark, labelCloseMark] = marks;
  if (!openMark || !labelCloseMark || !urlNode) {
    return { decorations: [] };
  }

  const strikeClasses = collectActiveStrikeClass(node);
  const decorations: Range<Decoration>[] = [
    Decoration.replace({}).range(openMark.from, openMark.to),
  ];
  // inclusiveStart/inclusiveEnd: true, same reasoning and same
  // confirmed-via-DOM justification as delimitedInlineRenderer's own —
  // required so this mark visually wraps a nested widget-replace
  // participant (e.g. a WikiLink) whose range exactly fills the label.
  if (openMark.to < labelCloseMark.from) {
    // Non-empty label: unchanged from before the URL fallback — the URL
    // portion (`](url "title")`) stays concealed as one combined range,
    // exactly as it always has.
    decorations.push(
      ...linkContentDecorations(openMark.to, labelCloseMark.from, strikeClasses)
    );
    decorations.push(
      Decoration.replace({}).range(labelCloseMark.from, linkNode.to)
    );
  } else {
    // Empty label: conceal `](` up to the URL's own start, class the URL
    // itself as the visible content, then conceal from the URL's own end
    // through the closing `)` (swallowing any optional title). `(` always
    // separates `]` from the URL in this grammar, and `)` always follows
    // the URL, so both replace ranges are always non-empty.
    decorations.push(
      Decoration.replace({}).range(labelCloseMark.from, urlNode.from)
    );
    decorations.push(
      ...linkContentDecorations(urlNode.from, urlNode.to, strikeClasses)
    );
    decorations.push(Decoration.replace({}).range(urlNode.to, linkNode.to));
  }
  return { decorations };
};

/**
 * Renderer for a bare `URL` occurrence (no `Link`/`Autolink` wrapper) —
 * reuses `Link`'s own `tok-link` class rather than inventing a second
 * visual convention, per docs/editor-architecture-decisions.md's "Link/URL
 * styling — resolved". No concealment: unlike `Link`, a bare URL has no
 * bracket/paren syntax to hide, so its at-rest and engaged forms are
 * identical by construction — it still participates in the shared
 * traversal (for the same `tok-link` styling and containment semantics as
 * every other participant), it just never differs when revealed.
 *
 * Guards against double-decorating a `URL` child that a *different*,
 * already-registered participant owns: `Link`'s own renderer conceals its
 * `URL` child as part of one combined replace range, and `Autolink`'s
 * `delimitedInlineRenderer` registration (below) already classes its own
 * `URL` child as `tok-link` content. `inlineLivePreviewRegion.ts`'s
 * traversal does not skip descending into a non-engaged participant's
 * children (only an *engaged* one short-circuits), so without this guard
 * a `URL` nested in either would be visited a second time and receive a
 * redundant, overlapping decoration.
 *
 * **`Image` added to this guard (composition-verification pass,
 * confirmed via a real mounted `EditorView` before this fix, not
 * assumed): a native `Image` node (`![alt](url)`) has exactly the same
 * `URL`-child shape as `Link`, but `Image` is deliberately *not*
 * registered in this participant map at all (it has its own standalone
 * mechanism, `image/imageLivePreview.ts` — see that file's own doc
 * comment for why). This traversal therefore treats `Image` as an
 * ordinary transparent node and keeps descending into it, same as any
 * unregistered node — which reaches its `URL` child same as any
 * Link/Autolink's. This was **always latently true**, including before
 * Image's own standalone extraction (when Image was still a
 * `widgetReplaceRenderer` participant, that renderer never returned
 * `false` from a non-engaged node either — only the engaged branch does),
 * but was invisible then because Image's at-rest form was *always* a
 * full-range `Decoration.replace`, with no state that ever exposed the
 * node's own raw text (and thus its nested `URL` child) as real, visible
 * DOM. It became visible only once Image gained a source-reveal state
 * independent of engagement: confirmed by mounting `![Alt](https://…)`
 * with `imageUiState`'s `revealed: true` and reading `view.dom.innerHTML`
 * — the URL rendered as `<span class="tok-link">https://…</span>`, a
 * real, incorrect decoration (an Image's raw URL is not a navigable link
 * the way a genuine `Link`'s href is). Excluding `Image` here is the
 * complete, narrowly-scoped fix — not a change to `imageLivePreview.ts`,
 * not a change to how `Image` is registered (or not) in this map, and not
 * a change to `Link`/`Autolink`'s own behavior.
 */
const urlRenderer: ParticipantRenderer = (node) => {
  const parentName = node.node.parent?.name;
  if (
    parentName === 'Link' ||
    parentName === 'Autolink' ||
    parentName === 'Image'
  ) {
    return { decorations: [] };
  }
  return {
    decorations: linkContentDecorations(node.from, node.to, collectActiveStrikeClass(node)),
  };
};

/**
 * `Autolink` (`<https://...>`) — deliberately its own renderer now, not
 * `delimitedInlineRenderer`. Its shape (`Autolink > [LinkMark, URL,
 * LinkMark]`) still fits that generic factory structurally, but that
 * factory composes `collectActiveStrikeClass` onto its own single mark —
 * exactly the "one element, two conflicting text-decoration declarations"
 * shape `linkContentDecorations` exists to avoid for `Link`/`URL`. Reusing
 * it here would leave Autolink as the one remaining place a struck link
 * still self-applied `tok-strike` directly (a real, previously-flagged gap
 * — confirmed live: `<https://x>` inside `~~...~~` rendered
 * `class="tok-link tok-strike"` on one span, the exact conflict this whole
 * mechanism exists to prevent). Concealment logic (marks `<`/`>`) is
 * copied verbatim from `delimitedInlineRenderer`; only the content range
 * now goes through `linkContentDecorations` instead of one directly-built
 * mark.
 */
const autolinkRenderer: ParticipantRenderer = (node) => {
  const autolinkNode = node.node;
  const openMark = autolinkNode.firstChild;
  const closeMark = autolinkNode.lastChild;
  if (
    !openMark ||
    openMark.name !== 'LinkMark' ||
    !closeMark ||
    closeMark.name !== 'LinkMark'
  ) {
    return { decorations: [] };
  }
  const markerDecoration = Decoration.replace({
    widget: new ConcealedMarkerWidget('cm-link-marker'),
  });
  const decorations: Range<Decoration>[] = [
    markerDecoration.range(openMark.from, openMark.to),
  ];
  if (openMark.to < closeMark.from) {
    decorations.push(
      ...linkContentDecorations(openMark.to, closeMark.from, collectActiveStrikeClass(node))
    );
  }
  decorations.push(markerDecoration.range(closeMark.from, closeMark.to));
  return { decorations };
};

/**
 * The resolvers each widget-family participant needs, obtained as stable
 * getter closures (e.g. `() => resolveWikiLinkRef.current`) rather than
 * captured resolver values — so the extension never needs rebuilding when
 * a resolver changes; only the ref's `.current` needs to change, which
 * the closure indirection already reads fresh on every decoration pass.
 * Mirrors the freshness pattern `MarkdownEditor.tsx` already uses for
 * `onEdit`/`onFlush`.
 */
export interface ParticipantResolvers {
  /** No longer read by this file — see the doc comment above. Optional so existing callers don't need to change. */
  readonly resolveWikiLink?: () => ResolveWikiLink | undefined;
  readonly resolveTag: () => ResolveTag | undefined;
  readonly resolveDate: () => ResolveDate | undefined;
}

/**
 * Builds the participant set. A factory rather than a static constant
 * because the widget-family entries close over `resolvers` — the map
 * itself is still built once (at `MarkdownEditor` mount time, alongside
 * every other extension), not rebuilt per render; only the resolver
 * getters' `.current` reads are per-pass.
 *
 * `inlineLivePreviewRegion.ts` reads this map and knows nothing else
 * about any construct — same as Phases 1–2, unchanged.
 */
export function createInlineLivePreviewParticipants(
  resolvers: ParticipantResolvers
): ReadonlyMap<string, ParticipantRenderer> {
  return new Map<string, ParticipantRenderer>([
    [
      'Emphasis',
      delimitedInlineRenderer(
        'EmphasisMark',
        'tok-emphasis',
        'cm-emphasis-marker'
      ),
    ],
    [
      'StrongEmphasis',
      delimitedInlineRenderer('EmphasisMark', 'tok-strong', 'cm-strong-marker'),
    ],
    // Not delimitedInlineRenderer (unlike every sibling entry here) —
    // Strikethrough needs its own tok-strike decoration split around any
    // Link/Autolink/URL descendant, never emitted as one mark spanning a
    // link. See strikethroughRenderer's own doc comment for why.
    ['Strikethrough', strikethroughRenderer],
    [
      'Highlight',
      delimitedInlineRenderer(
        'HighlightMark',
        'tok-highlight',
        'cm-highlight-marker'
      ),
    ],
    [
      'InlineCode',
      delimitedInlineRenderer('CodeMark', 'tok-code', 'cm-code-marker'),
    ],
    ['Link', linkRenderer],
    // Not delimitedInlineRenderer — see autolinkRenderer's own doc comment
    // for why Autolink needs the same linkContentDecorations path Link/URL
    // use, rather than the generic factory's single self-composed mark.
    ['Autolink', autolinkRenderer],
    ['URL', urlRenderer],
    [
      'Tag',
      widgetReplaceRenderer((raw, extraClasses) =>
        renderTag(raw, resolvers.resolveTag, extraClasses)
      ),
    ],
    [
      'Date',
      widgetReplaceRenderer((raw, extraClasses) =>
        renderDate(raw, resolvers.resolveDate, extraClasses)
      ),
    ],
    // Image is deliberately NOT a participant here (unlike Phase 1) — it
    // has its own standalone visibility mechanism instead
    // (image/imageLivePreview.ts), for the same kind of reason WikiLink
    // does: its required behavior (never reveal raw source on selection,
    // only on an explicit control) is not an instance of this shared
    // reveal-on-engagement contract at all. See that file's own doc
    // comment.
  ]);
}
