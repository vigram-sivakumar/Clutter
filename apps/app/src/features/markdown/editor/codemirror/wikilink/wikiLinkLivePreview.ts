import { syntaxTree } from '@codemirror/language';
import { Prec, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';

import { collectActiveInlineClasses, isDelimitedMarkConstruct } from '../highlight/inlineLivePreviewParticipants';
import { isTokenEngaged, type TokenNodeRange } from '../semanticToken/tokenEngagement';
import { getWikiLinkMarkerRanges, renderWikiLink } from './wikiLinkDecorations';
import type { ResolveWikiLink } from './wikiLinkResolution';

/**
 * Widens WikiLink's own engagement boundary to include any directly
 * enclosing chain of delimited-inline-formatting ancestors (Emphasis,
 * StrongEmphasis, Strikethrough, Highlight, InlineCode — every construct
 * `delimitedInlineRenderer` in `inlineLivePreviewParticipants.ts` handles),
 * without naming any of them: `isDelimitedMarkConstruct` (imported from
 * `inlineLivePreviewParticipants.ts`, shared with `collectActiveInlineClasses`'s
 * own ancestor walk below) is the same structural fact `delimitedInlineRenderer`
 * itself keys off (`firstChild`/`lastChild` same-name check). Reusing that
 * fact here, rather than a list of node names, is what keeps this generic:
 * it composes with any current or future participant following the same
 * grammar convention with zero new knowledge added about what that
 * participant is.
 *
 * Stops at the first ancestor that doesn't match — ordinary block
 * containers (Paragraph, Document, ListItem, TableCell, ...) never have
 * two identically-`Mark`-named children bracketing their content, so the
 * walk naturally terminates at the paragraph boundary rather than
 * reaching the document root.
 *
 * Without this, `**[[Page]]**` has a real two-character gap on each side
 * (the `**` runs) where StrongEmphasis's own, separately-computed
 * engagement is true but WikiLink's own (narrower) node range isn't yet —
 * producing a `**Page**` state that shouldn't exist. This makes WikiLink's
 * engagement track the *outermost* enclosing region that visually reveals
 * around it, exactly like nested delimited constructs already track each
 * other via `inlineLivePreviewRegion.ts`'s own short-circuit — just
 * computed bottom-up here, since WikiLink sits outside that traversal.
 */
function widenToEnclosingLivePreviewRegion(node: SyntaxNodeRef): TokenNodeRange {
  let widest: TokenNodeRange = { from: node.from, to: node.to };
  let ancestor = node.node.parent;
  while (ancestor && isDelimitedMarkConstruct(ancestor)) {
    widest = { from: ancestor.from, to: ancestor.to };
    ancestor = ancestor.parent;
  }
  return widest;
}

/**
 * WikiLink's own, standalone visibility mechanism — deliberately outside
 * `inlineLivePreviewRegion.ts`. At rest: `renderWikiLink` produces the
 * compact at-rest widget, atomic. Engaged: nothing is decorated at all —
 * the complete raw source (`[[`, the full folder-qualified path if any,
 * filename, `|alias` if present, `]]`) is ordinary, undecorated document
 * text, so CM6's own default cursor motion, selection, and Backspace/
 * Delete apply with no interception of any kind. This matches the
 * ordinary reveal-on-engagement contract every other construct in this
 * codebase follows (Tag, Date, headings, emphasis, ...): engaged means the
 * actual document text, in full, with nothing concealed and nothing
 * wrapped.
 *
 * **History, kept for context (full record in
 * docs/editor-architecture-decisions.md): two workarounds were tried here
 * and both were removed once shown unnecessary.** (1) Folder-path
 * concealment while engaged, paired with a bespoke ArrowLeft/ArrowRight
 * keymap to hop over the hidden text — removed 2026-09-09 once an audit
 * found WikiLink was the only construct whose engaged state didn't show
 * real source. (2) A `Decoration.mark({})` wrapping the engaged text,
 * added to work around a suspected WebKit/Tauri native-caret desync at the
 * bare-text/bare-text seam next to a freshly-revealed slash-free WikiLink
 * — removed once confirmed there is no longer any caret problem to work
 * around: with no concealment left anywhere in this file, the mark had no
 * class, no attributes, and no styling — nothing left for it to do.
 *
 * Reuses `isTokenEngaged` unchanged (imported, never modified) — the exact
 * same containment check every other construct uses, just evaluated from
 * this file's own tree scan instead of the shared traversal's.
 */
function buildDecorations(
  view: EditorView,
  getResolver: () => ResolveWikiLink | undefined
): { decorations: DecorationSet; atomic: DecorationSet } {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'WikiLink') {
          return;
        }

        if (node.to > view.state.doc.lineAt(node.from).to) {
          // A Decoration.replace() spanning a line break from this
          // ViewPlugin would throw "Decorations that replace line breaks
          // may not be specified via plugins" — the scanner
          // (wikiLinkScanner.ts) never emits a WikiLink node crossing a
          // physical line break, but this guards the invariant directly.
          return;
        }

        if (isTokenEngaged(view.state, widenToEnclosingLivePreviewRegion(node))) {
          // Engaged: the raw source stays ordinary, undecorated document
          // text — see this function's own doc comment above — except for
          // its own `[[`/`|`/`]]` punctuation, which now paints via the
          // shared `cm-marker` contract (marker-color unification), the
          // same treatment Emphasis/Link/Autolink's engaged marks already
          // get. This is additive only: no widget, no atomic range, no
          // change to which text is real vs. concealed.
          const raw = view.state.sliceDoc(node.from, node.to);
          for (const { from, to } of getWikiLinkMarkerRanges(raw)) {
            ranges.push(
              Decoration.mark({ class: 'cm-marker cm-wikilink-marker' }).range(node.from + from, node.from + to)
            );
          }
          return;
        }

        const raw = view.state.sliceDoc(node.from, node.to);
        const extraClasses = [...collectActiveInlineClasses(node)];
        const widget = renderWikiLink(raw, getResolver, extraClasses);
        if (!widget) {
          return;
        }
        const range = Decoration.replace({ widget }).range(node.from, node.to);
        ranges.push(range);
        atomicRanges.push(range);
      },
    });
  }

  return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomicRanges, true) };
}

interface WikiLinkLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

export function wikiLinkLivePreview(getResolver: () => ResolveWikiLink | undefined): Extension {
  const plugin = ViewPlugin.fromClass<WikiLinkLivePreviewPlugin>(
    class implements WikiLinkLivePreviewPlugin {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(view, getResolver));
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(update.view, getResolver));
        }
      }
    },
    { decorations: (p) => p.decorations }
  );

  const atomic = EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none);

  // Prec.high: keeps this extension self-contained rather than relying on
  // where MarkdownEditor.tsx happens to list it. CM6 nests mark/widget
  // decorations by facet precedence, not by range containment alone (see
  // Decoration.mark's own doc comment in @codemirror/view) — the enclosing
  // StrongEmphasis/Strikethrough/etc. content mark (inlineLivePreviewRegion,
  // default precedence) must not out-rank the WikiLink widget, or it gets
  // split at the widget's boundary instead of wrapping it. Verified by a
  // controlled A/B: swapping only registration order changed a bare
  // `<span class="tok-wikilink">` sibling into the correct
  // `tok-strong > tok-wikilink` nesting.
  return Prec.high([plugin, atomic]);
}
