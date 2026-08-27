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

    const decorations: Range<Decoration>[] = [markerDecoration.range(openMark.from, openMark.to)];
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
      decorations.push(
        Decoration.mark({ class: contentClass, inclusiveStart: true, inclusiveEnd: true }).range(
          openMark.to,
          closeMark.from
        )
      );
    }
    decorations.push(markerDecoration.range(closeMark.from, closeMark.to));
    return { decorations };
  };
}

/**
 * Which node names are marker-contract constructs for the *engaged*
 * subtree walk (`revealedMarkerRanges` below), and which node name each
 * one's own direct marker children carry. Deliberately explicit and
 * construct-scoped — never "any node whose name ends in `Mark`" — so
 * block-level mark owners (`HeaderMark`/`QuoteMark`/`ListMark`/
 * `TaskMarker`, each owned by its own line-scoped decoration source:
 * `headingMarkerDecoration.ts`/`blockquoteMarkerDecoration.ts`/
 * `listMarkerDecoration.ts`) are structurally unreachable here, not just
 * excluded by convention. Scoped to exactly the five constructs already
 * migrated to the marker-DOM contract (docs/markdown-dom-structure-
 * agreement.md §7.1's first slice) — same scope as
 * `delimitedInlineRenderer`'s own registrations below. Adding a construct
 * is one entry in this map, same shape as the `participants` map itself;
 * it never requires touching another construct's entry.
 */
const MARKER_CONSTRUCTS: ReadonlyMap<string, { readonly markNodeName: string; readonly markerClass: string }> =
  new Map([
    ['Emphasis', { markNodeName: 'EmphasisMark', markerClass: 'cm-emphasis-marker' }],
    ['StrongEmphasis', { markNodeName: 'EmphasisMark', markerClass: 'cm-strong-marker' }],
    ['Strikethrough', { markNodeName: 'StrikethroughMark', markerClass: 'cm-strike-marker' }],
    ['Highlight', { markNodeName: 'HighlightMark', markerClass: 'cm-highlight-marker' }],
    ['InlineCode', { markNodeName: 'CodeMark', markerClass: 'cm-code-marker' }],
  ]);

/**
 * Discovers every marker-contract construct's own marker ranges within an
 * **engaged** region's subtree, replacing the old per-node
 * `delimitedMarkerOnlyRenderer` lookup (which only ever reached the
 * engaged node's *own* two marks, per that function's now-superseded doc
 * comment — see docs/editor-architecture-decisions.md's correction entry
 * on nested inline Live Preview visibility).
 *
 * This is the fix for the confirmed bug: `inlineLivePreviewRegion.ts`'s
 * traversal still returns `false` at the engaged region root — region
 * atomicity (no descendant participant renderer runs, no `tok-*` content
 * decoration, no widget, no atomic range) is completely unchanged. This
 * function is called *in place of* resuming that traversal, and performs
 * a second, separate, narrowly-scoped walk over the engaged node's own
 * subtree using the *same* Lezer tree — never a second parser, never
 * combination-specific branches. For each descendant (including the root
 * itself) whose name is a key in `MARKER_CONSTRUCTS`, its direct marker
 * children (found the same way `delimitedInlineRenderer` already finds
 * two-mark constructs' delimiters, generalized to "however many direct
 * children carry the registered mark node name" rather than assuming
 * exactly `firstChild`/`lastChild`) become `cm-marker cm-{construct}-marker`
 * spans with no `--concealed` modifier — engaged is the one state an
 * inline marker is actually visible in, so it's the one state
 * `--marker-foreground` needs to reach (same reasoning the retired
 * `delimitedMarkerOnlyRenderer` doc comment already established).
 *
 * Nesting depth is never inspected or branched on: `***bold italic***`'s
 * `Emphasis > StrongEmphasis` is walked as two ordinary marker-construct
 * nodes, `~~***bold _italic_ `code`***~~`'s four levels are walked
 * identically. Content stays completely unstyled — this function only
 * ever pushes `cm-marker` ranges, never a `tok-*` range, so raw/unclassed
 * engaged content is a property of what this function *doesn't* do, not
 * something it enforces separately.
 */
export function revealedMarkerRanges(root: SyntaxNode): readonly Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  const cursor = root.cursor();
  do {
    const spec = MARKER_CONSTRUCTS.get(cursor.name);
    if (!spec) continue;
    const decoration = Decoration.mark({ class: `cm-marker ${spec.markerClass}` });
    for (let child = cursor.node.firstChild; child; child = child.nextSibling) {
      if (child.name === spec.markNodeName) {
        ranges.push(decoration.range(child.from, child.to));
      }
    }
  } while (cursor.next() && cursor.from < root.to);
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
 * `render` receives only the node's raw matched text — every renderer
 * registered through this factory today (`renderWikiLink`/`renderTag`/
 * `renderDate`) only ever needed `raw` and a resolver getter, never
 * `view` or the node itself (confirmed by inspecting each: their `_view`/
 * `_node` parameters were unused), so this factory doesn't thread through
 * anything that has no real consumer.
 */
function widgetReplaceRenderer(
  render: (raw: string) => WidgetType | null
): ParticipantRenderer {
  return (node, state) => {
    const widget = render(state.sliceDoc(node.from, node.to));
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
      Decoration.mark({ class: 'tok-link', inclusiveStart: true, inclusiveEnd: true }).range(
        openMark.to,
        labelCloseMark.from
      )
    );
    decorations.push(Decoration.replace({}).range(labelCloseMark.from, linkNode.to));
  } else {
    // Empty label: conceal `](` up to the URL's own start, class the URL
    // itself as the visible content, then conceal from the URL's own end
    // through the closing `)` (swallowing any optional title). `(` always
    // separates `]` from the URL in this grammar, and `)` always follows
    // the URL, so both replace ranges are always non-empty.
    decorations.push(Decoration.replace({}).range(labelCloseMark.from, urlNode.from));
    decorations.push(
      Decoration.mark({ class: 'tok-link', inclusiveStart: true, inclusiveEnd: true }).range(
        urlNode.from,
        urlNode.to
      )
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
 * redundant, overlapping decoration. Checking the immediate parent node
 * name is sufficient — a `URL` node's only possible non-`Paragraph`-ish
 * parents in this grammar are exactly `Link` and `Autolink`.
 */
const urlRenderer: ParticipantRenderer = (node) => {
  if (node.node.parent?.name === 'Link' || node.node.parent?.name === 'Autolink') {
    return { decorations: [] };
  }
  return {
    decorations: [Decoration.mark({ class: 'tok-link' }).range(node.from, node.to)],
  };
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
    ['Emphasis', delimitedInlineRenderer('EmphasisMark', 'tok-emphasis', 'cm-emphasis-marker')],
    ['StrongEmphasis', delimitedInlineRenderer('EmphasisMark', 'tok-strong', 'cm-strong-marker')],
    ['Strikethrough', delimitedInlineRenderer('StrikethroughMark', 'tok-strike', 'cm-strike-marker')],
    ['Highlight', delimitedInlineRenderer('HighlightMark', 'tok-highlight', 'cm-highlight-marker')],
    ['InlineCode', delimitedInlineRenderer('CodeMark', 'tok-code', 'cm-code-marker')],
    ['Link', linkRenderer],
    // Autolink (`<https://...>`) fits delimitedInlineRenderer's own
    // 2-same-named-mark-child shape exactly (`Autolink > [LinkMark, URL,
    // LinkMark]`) — reused unmodified, no Autolink-specific renderer
    // needed. Conceals `<`/`>`, classes the URL content `tok-link` — same
    // class Link's own label already uses. No `markerClass` — deliberately
    // out of scope for this migration slice (docs/markdown-dom-structure-
    // agreement.md §7.1): Autolink keeps its exact current
    // `Decoration.replace({})` marker behavior, unchanged.
    ['Autolink', delimitedInlineRenderer('LinkMark', 'tok-link')],
    ['URL', urlRenderer],
    ['Tag', widgetReplaceRenderer((raw) => renderTag(raw, resolvers.resolveTag))],
    ['Date', widgetReplaceRenderer((raw) => renderDate(raw, resolvers.resolveDate))],
  ]);
}

