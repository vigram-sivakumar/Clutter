import { syntaxTree } from '@codemirror/language';
import { Prec, type EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';

import {
  ImageWidget,
  type OnImageClick,
  type OnOpenImageMenu,
  type CurrentImageSource,
  type GetCurrentImageSource,
} from '../image/ImageWidget';
import { getImageUiState, imageUiStateField } from '../image/imageUiState';
import { resolveEmbedAliasFields } from '../mediaPresentation/mediaPresentationUpdate';
import { resolveImagePresentation, resolvePdfPresentation } from '../mediaPresentation/mediaPresentationModel';
import { scanEmbed } from './embedScanner';
import { findEmbedAt, isEngaged } from './embedEngagement';
import type { ResolveEmbedImage } from './embedImageResolution';
import { PdfEmbedWidget, type OnOpenPdfMenu, type OnPdfEmbedClick } from '../pdf/PdfEmbedWidget';
import type { ResolveEmbedPdf } from '../pdf/embedPdfResolution';
import { createPdfDocumentCache, type PdfDocumentCache } from '../pdf/pdfDocumentCache';

/**
 * Resource embeds' own `GetCurrentImageSource` — the Embed-scoped
 * counterpart to `ImageWidget.ts`'s `currentImageSource` (the standard
 * Markdown Image default). Re-resolves through the exact same injected
 * `ResolveEmbedImage` function `buildDecorations` below already uses —
 * never a second, parallel Resource lookup — so a probe's "is this still
 * valid" check can never disagree with what produced the widget in the
 * first place.
 */
function currentEmbedImageSource(
  getResolveEmbedImage: () => ResolveEmbedImage | undefined
): GetCurrentImageSource {
  return (state: EditorState, pos: number): CurrentImageSource | null => {
    const node = findEmbedAt(state, pos);
    if (!node) {
      return null;
    }
    const raw = state.sliceDoc(node.from, node.to);
    const match = scanEmbed(raw, 0);
    if (!match) {
      return null;
    }
    const resolution = getResolveEmbedImage()?.(match.path, match.alias);
    if (!resolution || resolution.status !== 'image') {
      return null;
    }
    return { url: resolution.url, to: node.to };
  };
}

/**
 * Embed's own live-preview extension — the resource-scoped counterpart to
 * `image/imageLivePreview.ts`, same decoration shapes (hidden-source
 * `Decoration.replace`, revealed-source `Decoration.widget` inserted after
 * the raw source), same `imageUiStateField`/`getImageUiState`/
 * `setImageUiState` mechanism (genuinely kind-agnostic already — it's keyed
 * by plain position, with no `'Image'`-node assumption in the parts this
 * file actually relies on: reveal/hide and the broken flag's persistence
 * and its `<img>`-onerror-driven recovery path). The one thing this file
 * adds beyond mirroring `imageLivePreview.ts` is resolving an `Embed`
 * node's target into an `EmbedImageResolution` before ever constructing a
 * widget — an `Embed` node has no raw `url` sitting in its own syntax the
 * way a native `Image` node does; `ResolveEmbedImage` (injected, composed
 * in the app layer from `resolveResourceEmbed()` +
 * `Application.resolveResourceImageUrl()`) is what supplies one.
 *
 * Three outcomes per `Embed` node found (see `EmbedImageResolution`'s own
 * doc comment):
 * - `'image'`: render exactly like a working standard image — same
 *   `ImageWidget`, `url` set to the resolved, loadable file URL.
 * - `'unresolved'`: render `ImageWidget` in its already-existing broken
 *   state from construction (never via a real, doomed-to-fail `<img>`
 *   load attempt) — `url: ''`, so no native network request/broken-glyph
 *   risk (`ImageWidget.renderBroken`'s own probe simply never resolves
 *   for an empty `src`, which is the correct outcome: there is nothing to
 *   recover until the next full decoration rebuild re-checks resolution).
 * - `'non-image'`: not this milestone's concern (PDF rendering) — no
 *   decoration at all, the raw `![[...]]` Markdown stays plain, editable
 *   text, same as an incomplete/unparseable Embed already does.
 *
 * Two guards run before any of the above, in order, both producing "no
 * decoration at all" (plain, literal, editable Markdown) rather than any
 * widget:
 *
 * 1. **Empty/whitespace-only target (`![[]]`, `![[ ]]`)** — Lezer's grammar
 *    has no concept of "empty is incomplete" (it's a syntactically valid,
 *    complete `Embed` node with `path: ''`), so without this check an
 *    empty target would reach resolution, resolve to `'unresolved'`, and
 *    render broken — exactly the bug this guard exists to prevent.
 *    Mirrors two already-established precedents solving the identical
 *    problem for a different construct each: `wikiLinkDecorations.ts`'s
 *    `renderWikiLink` (`!match.path.trim()` → `null`, "an in-progress or
 *    intentionally empty WikiLink is never silently invisible... nor
 *    broken") and `imageScanner.ts`'s `scanImage` (an empty destination —
 *    exactly what CM6's `closeBrackets()` produces the instant `(` is
 *    typed — is "not yet a complete image," not a broken one). This is
 *    the same rule, generalized to a third construct, not a new
 *    invention — and unlike the other two guards below, it holds
 *    unconditionally, in every state, forever: an empty target never
 *    becomes meaningful on its own, so there is no "first leave" moment
 *    to wait for.
 * 2. **Pending first leave, currently engaged, not yet explicitly
 *    revealed** — the "first leave" rule (Phase 2, 2026-09
 *    rendering-lifecycle unification): a just-typed, still-incomplete-
 *    then-just-completed `![[image.png]]`, cursor still sitting at/inside
 *    it, must not immediately collapse into a rendered (or broken) widget
 *    while the user may still be editing it. `ui.pendingFirstLeave`
 *    (`imageUiState.ts`) — not a bare `isEngaged` check — is what scopes
 *    this to a *genuinely fresh* occurrence: `isEngaged` alone can't tell
 *    "the caret is here because this was just typed" from "the caret is
 *    here because it arrow-keyed/clicked past an already-at-rest embed"
 *    (confirmed directly — CM6's atomic-range navigation lands the caret
 *    exactly at a node's boundary, satisfying `isEngaged` identically to
 *    genuine editing), and only the former should stay raw.
 *
 *    **Deliberate exception — selecting a suggestion from autocomplete
 *    renders immediately**, per this milestone's own explicit product
 *    requirement ("the selected resource is already known and resolved
 *    in ~99% of cases"): `embedCompletionSource.ts`'s own `apply()`
 *    writes `pendingFirstLeave: false` explicitly, in the same
 *    transaction as the insert — even though the accepted completion's
 *    cursor placement (`node.to`) is itself "engaged," this guard never
 *    fires for it, because `pendingFirstLeave` is already `false` by the
 *    time this decoration rebuild runs. Manually typing/pasting a
 *    `![[...]]` (no completion involved) is the only path that leaves
 *    `pendingFirstLeave: true` and actually stays raw here.
 *
 *    `ui.revealed` (the Edit-source button, unchanged from standard
 *    images) is still checked as a separate, independent override:
 *    clicking Edit on an already-rendered widget places the cursor at
 *    `to` too, which is what still gets Edit's own "both raw AND
 *    rendered, simultaneously" shape below (identical to standard
 *    images) rather than this guard's "nothing rendered at all" shape —
 *    genuinely different outcomes for a reason: Edit is a deliberate
 *    request to inspect/edit an already-working embed's source without
 *    losing sight of the image, whereas a fresh, still-being-typed embed
 *    has nothing worth showing yet.
 *
 * `getResolveEmbedImage` mirrors `imageLivePreview`'s own
 * `getOnImageClick`/`getOnOpenImageMenu` injected-getter shape — read fresh
 * per rebuild/per probe-resolve, never captured once.
 */
function buildDecorations(
  view: EditorView,
  getResolveEmbedImage: () => ResolveEmbedImage | undefined,
  getOnImageClick: () => OnImageClick | undefined,
  getOnOpenImageMenu: () => OnOpenImageMenu | undefined,
  getResolveEmbedPdf: () => ResolveEmbedPdf | undefined,
  getOnPdfEmbedClick: () => OnPdfEmbedClick | undefined,
  getOnOpenPdfMenu: () => OnOpenPdfMenu | undefined,
  pdfDocumentCache: PdfDocumentCache
): { decorations: DecorationSet; atomic: DecorationSet } {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];
  const getCurrentSource = currentEmbedImageSource(getResolveEmbedImage);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Embed') {
          return;
        }

        if (node.to > view.state.doc.lineAt(node.from).to) {
          // Same line-break guard imageLivePreview.ts/wikiLinkLivePreview.ts
          // already apply — a Decoration.replace()/widget from a
          // ViewPlugin may never cross a line break.
          return;
        }

        const raw = view.state.sliceDoc(node.from, node.to);
        const match = scanEmbed(raw, 0);
        if (!match || !match.path.trim()) {
          // Empty/whitespace-only target — never rendered, in any state,
          // forever. See this function's own doc comment, guard 1.
          return;
        }

        const baseUi = getImageUiState(view.state, node.from, node.to);

        if (baseUi.pendingFirstLeave && isEngaged(view.state, node) && !baseUi.revealed) {
          // Still being typed for the first time — no widget at all yet,
          // plain editable raw text. See this function's own doc comment,
          // guard 2. `pendingFirstLeave` (Phase 2, `imageUiState.ts`), not
          // a bare `isEngaged` check, is what keeps this from also firing
          // for an already-at-rest embed the caret merely arrow-keyed/
          // clicked past — confirmed directly that CM6's atomic-range
          // navigation lands the caret exactly at a node's boundary,
          // which `isEngaged` alone can't distinguish from genuine
          // mid-edit engagement. Selecting a suggestion from autocomplete
          // renders immediately despite the caret landing at the node's
          // own `to` (also "engaged") because `embedCompletionSource.ts`'s
          // own `apply()` explicitly writes `pendingFirstLeave: false` in
          // the same transaction as the insert.
          return;
        }

        const resolveEmbedImage = getResolveEmbedImage();
        if (!resolveEmbedImage) {
          return;
        }

        const resolution = resolveEmbedImage(match.path, match.alias);
        if (resolution.status === 'non-image') {
          // Not an image — resolveResourceEmbed() already found a real
          // VaultResource here (an 'unresolved' target never reaches this
          // branch, see the guard above), so the only other possibility
          // given VaultResourceKind = 'pdf' | 'image' is a PDF. Consulted
          // only here, never in place of the image resolution above — see
          // embedPdfResolution.ts's own doc comment.
          const resolveEmbedPdf = getResolveEmbedPdf();
          const pdfResolution = resolveEmbedPdf?.(match.path, match.alias);
          if (pdfResolution?.status !== 'pdf') {
            return;
          }

          const pdfWidget = new PdfEmbedWidget(
            pdfResolution.title,
            pdfResolution.url,
            pdfResolution.path,
            pdfResolution.resourceId,
            baseUi,
            node.from,
            node.to,
            getOnPdfEmbedClick,
            getOnOpenPdfMenu,
            pdfDocumentCache,
            resolvePdfPresentation(resolveEmbedAliasFields(match.alias).tokens)
          );

          if (baseUi.revealed) {
            ranges.push(Decoration.widget({ widget: pdfWidget, side: 1 }).range(node.to));
          } else {
            const range = Decoration.replace({ widget: pdfWidget }).range(node.from, node.to);
            ranges.push(range);
            atomicRanges.push(range);
          }
          return;
        }

        const ui =
          resolution.status === 'unresolved'
            ? { ...baseUi, broken: true }
            : baseUi;
        const url = resolution.status === 'unresolved' ? '' : resolution.url;
        const alt = resolution.alt;
        const copyUrl =
          resolution.status === 'image'
            ? resolution.copyUrl
            : resolution.status === 'unresolved'
              ? match.path
              : undefined;

        const widget = new ImageWidget(
          alt,
          url,
          ui,
          node.from,
          node.to,
          getOnImageClick,
          getOnOpenImageMenu,
          getCurrentSource,
          copyUrl,
          resolveImagePresentation(resolveEmbedAliasFields(match.alias).tokens)
        );

        if (ui.revealed) {
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

interface EmbedLivePreviewPlugin extends PluginValue {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

/**
 * `getOnImageClick`/`getOnOpenImageMenu` are the exact same injected
 * getters `imageLivePreview()` uses — embeds share the image overlay and
 * options menu wholesale, per this milestone's own architectural
 * constraint (one `ImageWidget`, not a parallel one).
 *
 * `getResolveEmbedPdf`/`getOnPdfEmbedClick`/`getOnOpenPdfMenu` are the
 * PDF-embed counterparts — consulted only when `getResolveEmbedImage`'s own
 * resolution says `'non-image'` for a target, see `buildDecorations`'s own
 * doc comment on that branch.
 */
export function embedLivePreview(
  getResolveEmbedImage: () => ResolveEmbedImage | undefined,
  getOnImageClick: () => OnImageClick | undefined,
  getOnOpenImageMenu: () => OnOpenImageMenu | undefined,
  getResolveEmbedPdf: () => ResolveEmbedPdf | undefined,
  getOnPdfEmbedClick: () => OnPdfEmbedClick | undefined,
  getOnOpenPdfMenu: () => OnOpenPdfMenu | undefined
): Extension {
  const plugin = ViewPlugin.fromClass<EmbedLivePreviewPlugin>(
    class implements EmbedLivePreviewPlugin {
      decorations: DecorationSet;
      atomic: DecorationSet;
      // One cache per EditorView instance (this ViewPlugin's own lifetime),
      // shared by every PdfEmbedWidget reconstruction in this document —
      // see pdfDocumentCache.ts's own doc comment for why this exists (the
      // reveal-toggle flicker fix) and destroyAll()'s call site below for
      // its teardown.
      pdfDocumentCache: PdfDocumentCache = createPdfDocumentCache();

      constructor(view: EditorView) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(
          view,
          getResolveEmbedImage,
          getOnImageClick,
          getOnOpenImageMenu,
          getResolveEmbedPdf,
          getOnPdfEmbedClick,
          getOnOpenPdfMenu,
          this.pdfDocumentCache
        ));
      }

      update(update: ViewUpdate) {
        const uiChanged = update.startState.field(imageUiStateField) !== update.state.field(imageUiStateField);
        if (update.docChanged || update.viewportChanged || update.selectionSet || uiChanged) {
          ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(
            update.view,
            getResolveEmbedImage,
            getOnImageClick,
            getOnOpenImageMenu,
            getResolveEmbedPdf,
            getOnPdfEmbedClick,
            getOnOpenPdfMenu,
            this.pdfDocumentCache
          ));
        }
      }

      destroy() {
        this.pdfDocumentCache.destroyAll();
      }
    },
    { decorations: (p) => p.decorations }
  );

  const atomic = EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? Decoration.none);

  // imageUiStateField is included here too, not only in imageLivePreview()
  // — CM6 deduplicates an identical StateField extension by reference, so
  // this is harmless when both extensions are installed together (the real
  // app always installs both), and is what keeps this extension
  // self-contained/independently testable rather than silently depending
  // on imageLivePreview() happening to be present elsewhere in the
  // extension list to register the field it reads from.
  //
  // Prec.high for the same reason imageLivePreview.ts/wikiLinkLivePreview.ts
  // document on themselves.
  return Prec.high([imageUiStateField, plugin, atomic]);
}
