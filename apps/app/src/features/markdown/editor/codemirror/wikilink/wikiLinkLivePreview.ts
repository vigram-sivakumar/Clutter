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
import { collectActiveInlineClasses } from '../highlight/inlineLivePreviewParticipants';
import { isTokenEngaged, widenToEnclosingDelimitedRegion } from '../semanticToken/tokenEngagement';
import { getWikiLinkMarkerRanges, renderWikiLink } from './wikiLinkDecorations';
import type { ResolveWikiLink } from './wikiLinkResolution';

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

        if (isTokenEngaged(view.state, widenToEnclosingDelimitedRegion(node.node))) {
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
