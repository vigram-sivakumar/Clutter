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

import { ImageWidget, type OnImageClick, type OnOpenImageMenu } from './ImageWidget';
import { scanImage } from './imageScanner';
import { getImageUiState, imageUiStateField } from './imageUiState';

/**
 * Image's own standalone visibility mechanism — deliberately outside
 * `inlineLivePreviewRegion.ts`, the same reason and the same shape as
 * WikiLink's own extraction (`wikilink/wikiLinkLivePreview.ts`). Image no
 * longer implements the shared mechanism's reveal-on-engagement contract
 * at all: the required behavior (per the product correction this file
 * implements) is that the rendered image must **never** be replaced by raw
 * Markdown as a side effect of the caret entering it — only an explicit
 * user action (the widget's own edit/source button) reveals the source,
 * and when it does, the raw Markdown appears as ordinary editable text
 * *and* the rendered image remains, immediately below it. Neither of
 * those two things is expressible as "engaged region reveals raw source,"
 * which is why this needed its own extension rather than a flag on the
 * shared participant contract.
 *
 * Two decoration shapes, chosen per node from `imageUiState.ts`'s
 * per-position, selection-independent UI state (not `isTokenEngaged`,
 * imported nowhere in this file):
 *
 * - **Hidden source** (default): `Decoration.replace({widget})` over the
 *   whole node, exactly Phase 1's shape — the widget is the only rendered
 *   form, atomic, same as WikiLink/Tag/Date's own at-rest widgets.
 * - **Revealed source**: no replace decoration over the node at all — its
 *   raw Markdown stays real, ordinary, directly editable document text,
 *   automatically inheriting every default CM6 behavior (typing, arrow
 *   keys, selection, IME) with zero special-cased code, the same "derive
 *   nothing, override nothing" property `isTokenEngaged`'s selection-driven
 *   reveal gives every other construct. A `Decoration.widget({block: true})`
 *   is additionally inserted immediately after the node's own end, so the
 *   rendered image appears as its own block directly below the editable
 *   source — both representations exist simultaneously, per the explicit
 *   product requirement. Not atomic while revealed: the source is meant to
 *   be edited character-by-character like any other raw Markdown.
 *
 * `ImageWidget.eq()` (alt/url/pos/ui) is what makes "the rendered image
 * only updates when the underlying value changes" fall out for free: CM6
 * diffs decorations by `eq()` on every rebuild (including one triggered by
 * nothing more than moving the caret, since this file's own `update()`
 * still rebuilds on `selectionSet` — needed only so an *enclosing*
 * document edit's viewport/selection changes are picked up, never because
 * Image's own visibility depends on it) — an unchanged alt/url/ui produces
 * an `eq()`-equal widget instance, which CM6 reuses without touching the
 * DOM, rather than tearing down and recreating it.
 */
function buildDecorations(
  view: EditorView,
  getOnImageClick: () => OnImageClick | undefined,
  getOnOpenImageMenu: () => OnOpenImageMenu | undefined
): { decorations: DecorationSet; atomic: DecorationSet } {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Image') {
          return;
        }

        if (node.to > view.state.doc.lineAt(node.from).to) {
          // Mirrors wikiLinkLivePreview.ts's identical guard: a
          // Decoration.replace()/widget from a ViewPlugin may never cross
          // a line break. Native Image nodes don't cross lines in
          // practice, but this is belt-and-suspenders against the CM6
          // invariant rather than an assumption.
          return;
        }

        const raw = view.state.sliceDoc(node.from, node.to);
        const match = scanImage(raw);
        if (!match) {
          return;
        }

        const ui = getImageUiState(view.state, node.from);
        const widget = new ImageWidget(
          match.alt,
          match.url,
          ui,
          node.from,
          node.to,
          getOnImageClick,
          getOnOpenImageMenu
        );

        if (ui.revealed) {
          // Deliberately NOT `block: true` — CM6 forbids block decorations
          // from a ViewPlugin source ("Block decorations may not be
          // specified via plugins," only a StateField-provided decoration
          // set may set that flag). An ordinary inline widget, styled
          // `display: block` in CSS (`.cm-image-container`, already
          // `display: block`), achieves the identical visual result — the
          // browser breaks the surrounding inline flow around a block-level
          // child regardless of how the decoration itself was declared —
          // without moving this construct's decoration source into a
          // StateField (which would trade the ViewPlugin's per-viewport
          // scoping away for whole-document scanning; not warranted here).
          ranges.push(Decoration.widget({ widget, side: 1 }).range(node.to));
        } else {
          const range = Decoration.replace({ widget }).range(node.from, node.to);
          ranges.push(range);
          atomicRanges.push(range);
        }
      },
    });
  }

  return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomicRanges, true) };
}

interface ImageLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

/**
 * `getOnImageClick` mirrors `wikiLinkLivePreview`'s own injected-getter
 * shape (`getResolver: () => ResolveWikiLink | undefined`) — a stable
 * closure supplied once at extension-construction time
 * (`MarkdownEditor.tsx`), read fresh by each widget at click time rather
 * than resolved into the widget upfront, so the actual callback can change
 * (e.g. a future re-render) without ever rebuilding this extension.
 * Presentational only: opening an image overlay needs no `Vault`/
 * `PageOperations` access, so — unlike WikiLink/Tag/Date — this callback's
 * implementation lives entirely inside `MarkdownEditor.tsx` itself, not
 * composed in the app layer.
 */
export function imageLivePreview(
  getOnImageClick: () => OnImageClick | undefined,
  getOnOpenImageMenu: () => OnOpenImageMenu | undefined
): Extension {
  const plugin = ViewPlugin.fromClass<ImageLivePreviewPlugin>(
    class implements ImageLivePreviewPlugin {
      decorations: DecorationSet;
      atomic: DecorationSet;

      constructor(view: EditorView) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(
          view,
          getOnImageClick,
          getOnOpenImageMenu
        ));
      }

      update(update: ViewUpdate) {
        const uiChanged = update.startState.field(imageUiStateField) !== update.state.field(imageUiStateField);
        if (update.docChanged || update.viewportChanged || update.selectionSet || uiChanged) {
          ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(
            update.view,
            getOnImageClick,
            getOnOpenImageMenu
          ));
        }
      }
    },
    { decorations: (p) => p.decorations }
  );

  const atomic = EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none);

  // Prec.high for the same reason wikiLinkLivePreview.ts documents on
  // itself: CM6 nests mark/widget decorations by facet precedence, not by
  // range containment alone, so an enclosing shared-traversal mark (e.g.
  // Image nested inside **bold**) must not out-rank this widget.
  return Prec.high([imageUiStateField, plugin, atomic]);
}
