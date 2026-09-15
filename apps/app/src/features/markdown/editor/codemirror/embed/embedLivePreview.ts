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
import { getImageUiState, hasImageUiStateEntry, imageUiStateField } from '../image/imageUiState';
import { resolveEmbedAliasFields } from '../mediaPresentation/mediaPresentationUpdate';
import { resolveImagePresentation, resolvePdfPresentation } from '../mediaPresentation/mediaPresentationModel';
import { getEmbedMarkerRanges, scanEmbed } from './embedScanner';
import { findEmbedAt, isEngaged } from './embedEngagement';
import type { ResolveEmbedImage } from './embedImageResolution';
import { classifyEmbedTargetExtension } from './embedTargetKind';
import { UnknownEmbedWidget } from '../mediaPresentation/UnknownEmbedWidget';
import { PdfEmbedWidget, type OnOpenPdfMenu, type OnPdfEmbedClick } from '../pdf/PdfEmbedWidget';
import type { ResolveEmbedPdf } from '../pdf/embedPdfResolution';
import { createPdfDocumentCache, type PdfDocumentCache } from '../pdf/pdfDocumentCache';
import { NoteEmbedWidget, type OnOpenNoteEmbedMenu, type FoldStatePersistence } from './NoteEmbedWidget';
import type { ResolvePageEmbed } from '../../../render/blocks/pageEmbedResolution';
import {
  checkNoteEmbedAncestry,
  DEFAULT_MAX_EMBED_DEPTH,
  ROOT_ANCESTRY,
  type NoteEmbedAncestry,
} from './noteEmbedAncestry';
import { buildEditorExtensions } from '../buildEditorExtensions';
import type { ResolveWikiLink } from '../wikilink/wikiLinkResolution';
import type { ResolveTag } from '../tag/tagResolution';
import type { ResolveDate } from '../date/dateResolution';
import type { ResolveImageSrc } from '../image/imageSrcResolution';

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
 * - `'unresolved'`: no `VaultResource` exists for this target at all — the
 *   PDF resolver is consulted first (below) in case the target path's own
 *   extension says this was meant to be a PDF (a missing/deleted/mistyped
 *   `.pdf` reference must still render as a missing *PDF*, not a missing
 *   image); only if the PDF resolver also declines does this render
 *   `ImageWidget` in its already-existing broken state from construction
 *   (never via a real, doomed-to-fail `<img>` load attempt) — `url: ''`,
 *   so no native network request/broken-glyph risk (`ImageWidget.
 *   renderBroken`'s own probe simply never resolves for an empty `src`,
 *   which is the correct outcome: there is nothing to recover until the
 *   next full decoration rebuild re-checks resolution).
 * - `'non-image'`: a real `VaultResource` was found, just not of kind
 *   `'image'` — the PDF resolver is consulted (below); anything else is
 *   out of scope, and the raw `![[...]]` Markdown stays plain, editable
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
export interface EmbedLivePreviewOptions {
  readonly resolveEmbedImage: () => ResolveEmbedImage | undefined;
  readonly onImageClick: () => OnImageClick | undefined;
  readonly onOpenImageMenu: () => OnOpenImageMenu | undefined;
  readonly resolveEmbedPdf: () => ResolveEmbedPdf | undefined;
  readonly onPdfEmbedClick: () => OnPdfEmbedClick | undefined;
  readonly onOpenPdfMenu: () => OnOpenPdfMenu | undefined;
  /**
   * Consulted only after both resolvers above decline (see this file's
   * own doc comment, the `'unresolved'`-and-not-a-PDF fallthrough) —
   * `![[...]]` is one shared syntax for a resource embed (image/PDF) and
   * a note embed alike; a target that resolves to neither a `VaultResource`
   * nor a PDF-by-extension is the one case worth asking "is this a page
   * instead." Omitted entirely (every pre-note-embed call site) simply
   * skips that question, falling through to the same missing-resource
   * rendering as always.
   */
  readonly resolvePageEmbed?: () => ResolvePageEmbed | undefined;
  /** A resolved note embed's own Expand action (opens the real source note) — see `NoteEmbedWidget.ts`'s doc comment. */
  readonly onOpenPage?: () => ((pageId: string) => void) | undefined;
  /** A resolved note embed's own "More actions" trigger — see `NoteEmbedWidget.ts`'s/`NoteEmbedMoreActions.tsx`'s doc comments. Stubbed to `() => undefined` for a nested note embed's own recursive extension build, same as `onOpenImageMenu`/`onOpenPdfMenu` are — More actions is hidden entirely for a nested read-only embed (requirement 6), so there is nothing for it to open there anyway. */
  readonly onOpenNoteEmbedMenu?: () => OnOpenNoteEmbedMenu | undefined;
  /**
   * Threaded through only so a resolved note embed's own nested view
   * (`NoteEmbedWidget`) can be built with the *same* resolvers the
   * embedding document already has — WikiLink/Tag/Date/standard-image
   * rendering inside an embedded note must look exactly as it would if
   * that note were open directly, not a stripped-down subset. Never
   * consulted by this file's own image/PDF/page resolution — only
   * forwarded into `buildEditorExtensions()` below.
   */
  readonly resolveWikiLink?: () => ResolveWikiLink | undefined;
  readonly resolveTag?: () => ResolveTag | undefined;
  readonly resolveDate?: () => ResolveDate | undefined;
  readonly resolveImageSrc?: () => ResolveImageSrc | undefined;
  /** Defaults to `ROOT_ANCESTRY` — the top-level editor's own starting point (see `buildEditorExtensions.ts`'s doc comment on this same field). */
  readonly ancestry?: NoteEmbedAncestry;
  readonly maxEmbedDepth?: number;
  /**
   * ADR-033's amendment — a resolved note embed's own nested view restores/
   * persists CM6 fold state keyed by the *embedded* page's own `pageId`
   * (never the host note's), through this same store. Same injected-getter/
   * freshness convention as `onOpenPage`/`onOpenNoteEmbedMenu` above.
   * Threaded one level deeper into a further-nested embed's own recursive
   * `buildEditorExtensions()` call below, the same way `ancestry` already
   * is, so fold persistence works at every embed depth, each level keyed
   * by its own `pageId`.
   */
  readonly getFoldStateStore?: () => FoldStatePersistence | undefined;
  /**
   * ADR-033's second amendment — whichever document's own Markdown is
   * *currently being rendered* by this `embedLivePreview()` instance
   * (i.e. this document's own stable `pageId`, the same one
   * `getFoldStateStore().get`/`set` above already key that document's own
   * top-level CM6 fold state by). Required (not optional, unlike the
   * resolvers above) because there is no safe default — an omitted or
   * wrong value would silently associate a resolved note embed's outer
   * "collapse this whole card" state with the wrong document, or with no
   * document at all. A resolved note embed's own recursive
   * `buildEditorExtensions()` call (below) passes its own
   * `resolution.pageId` as the *next* level's `hostPageId`, the same
   * one-level-deeper threading `ancestry` already uses — the embedded
   * page becomes the "host" for whatever's nested inside *it*.
   */
  readonly hostPageId: string;
}

function buildDecorations(
  view: EditorView,
  options: EmbedLivePreviewOptions,
  pdfDocumentCache: PdfDocumentCache
): { decorations: DecorationSet; atomic: DecorationSet } {
  const {
    resolveEmbedImage: getResolveEmbedImage,
    onImageClick: getOnImageClick,
    onOpenImageMenu: getOnOpenImageMenu,
    resolveEmbedPdf: getResolveEmbedPdf,
    onPdfEmbedClick: getOnPdfEmbedClick,
    onOpenPdfMenu: getOnOpenPdfMenu,
    resolvePageEmbed: getResolvePageEmbed,
    onOpenPage: getOnOpenPage,
    onOpenNoteEmbedMenu: getOnOpenNoteEmbedMenu,
    resolveWikiLink: getResolveWikiLink,
    resolveTag: getResolveTag,
    resolveDate: getResolveDate,
    resolveImageSrc: getResolveImageSrc,
    ancestry = ROOT_ANCESTRY,
    maxEmbedDepth = DEFAULT_MAX_EMBED_DEPTH,
    getFoldStateStore,
    hostPageId,
  } = options;
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

        // Marker-color unification: Embed's own `![[`/`|`/`]]` punctuation,
        // as absolute-position decoration ranges — reused at every point
        // below where this node's raw source stays visible document text
        // (pending-first-leave, an explicit Edit-source reveal, or a
        // permanently-unwidgeted resolution like `'non-image'`), never at
        // a point where the node is fully replaced by a widget
        // (`Decoration.replace` over `[node.from, node.to)` conceals the
        // marker text along with everything else, so there is nothing to
        // paint there).
        const markerRanges = getEmbedMarkerRanges(raw).map(({ from, to }) =>
          Decoration.mark({ class: 'cm-marker cm-embed-marker' }).range(node.from + from, node.from + to)
        );

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
          ranges.push(...markerRanges);
          return;
        }

        const resolveEmbedImage = getResolveEmbedImage();
        if (!resolveEmbedImage) {
          return;
        }

        const resolution = resolveEmbedImage(match.path, match.alias);
        if (resolution.status === 'non-image' || resolution.status === 'unresolved') {
          // Two different reasons to ask the PDF resolver, same question
          // either way — "should this render as a PDF instead": for
          // 'non-image', resolveResourceEmbed() already found a real
          // VaultResource that just isn't of kind 'image', so the only
          // other possibility given VaultResourceKind = 'pdf' | 'image' is
          // a PDF; for 'unresolved', no VaultResource exists at all, but
          // the target path's own extension may still say this was meant
          // to be a PDF (embedPdfResolution.ts's own doc comment has the
          // full account of that fallback). Consulted only here, never in
          // place of the image resolution above.
          const resolveEmbedPdf = getResolveEmbedPdf();
          const pdfResolution = resolveEmbedPdf?.(match.path, match.alias);

          if (pdfResolution?.status === 'pdf') {
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
              ranges.push(...markerRanges);
              ranges.push(Decoration.widget({ widget: pdfWidget, side: 1 }).range(node.to));
            } else {
              const range = Decoration.replace({ widget: pdfWidget }).range(node.from, node.to);
              ranges.push(range);
              atomicRanges.push(range);
            }
            return;
          }

          if (pdfResolution?.status === 'unresolved') {
            // No VaultResource, but the path's own extension confirms
            // this was meant to be a PDF — render PdfEmbedWidget already
            // in its broken state (url: '' — never a real load attempt,
            // the same "nothing to recover until the next full decoration
            // rebuild re-checks resolution" principle the image side's
            // own 'unresolved' branch below already establishes;
            // resourceId: '' since renderBroken()'s own controls never
            // read it — no "More actions" menu exists for a broken PDF).
            const pdfWidget = new PdfEmbedWidget(
              pdfResolution.title,
              '',
              match.path,
              '',
              { ...baseUi, broken: true },
              node.from,
              node.to,
              getOnPdfEmbedClick,
              getOnOpenPdfMenu,
              pdfDocumentCache,
              resolvePdfPresentation(resolveEmbedAliasFields(match.alias).tokens)
            );
            const range = Decoration.replace({ widget: pdfWidget }).range(node.from, node.to);
            ranges.push(range);
            atomicRanges.push(range);
            return;
          }

          if (resolution.status === 'non-image') {
            // A real, resolved non-PDF, non-image resource — out of scope
            // for both widget families, same as before this fix. Raw
            // source stays visible permanently in this state, so its own
            // marker punctuation still gets colored.
            ranges.push(...markerRanges);
            return;
          }

          // resolution.status === 'unresolved' and the PDF resolver
          // declined too (not a PDF-looking path either). Classify the
          // raw target BY ITS OWN EXTENSION before ever asking whether it
          // names a page — a failed resolution must never itself decide
          // the type. This is the exact bug `embedTargetKind.ts` fixes:
          // `![[statue.pngs]]` (a typo'd image extension) used to fall
          // through unconditionally to page resolution below and render
          // as "Note not found" simply because nothing else claimed it.
          // See that module's own doc comment for the full rule.
          const targetKind = classifyEmbedTargetExtension(match.path);

          if (targetKind === 'unrecognized') {
            // An extension is present but isn't a recognized image type
            // (a real `.pdf` target was already fully handled above) —
            // never presumed to name a page either. The shared, generic
            // "unsupported file" card, not a guess at either type.
            const widget = new UnknownEmbedWidget(match.path, { ...baseUi, broken: true }, node.from, node.to);
            if (baseUi.revealed) {
              ranges.push(...markerRanges);
              ranges.push(Decoration.widget({ widget, side: 1 }).range(node.to));
            } else {
              const range = Decoration.replace({ widget }).range(node.from, node.to);
              ranges.push(range);
              atomicRanges.push(range);
            }
            return;
          }

          if (targetKind === 'no-extension') {
            // The only shape ever presumed to name a page. See this
            // file's own doc comment and `EmbedLivePreviewOptions`'s
            // `resolvePageEmbed` field.
            const resolvePageEmbed = getResolvePageEmbed?.();
            const pageResolution = resolvePageEmbed?.(match.path);

            if (pageResolution?.status === 'resolved') {
              const ancestryCheck = checkNoteEmbedAncestry(ancestry, pageResolution.pageId, maxEmbedDepth);

              if (ancestryCheck.ok) {
                // ADR-033's second amendment: the outer "collapse this
                // whole card" flag is seeded from the persisted store only
                // when this exact position has no *live* entry yet this
                // session (`hasImageUiStateEntry`) — once a live entry
                // exists (the user already toggled it this session, or a
                // prior transaction otherwise wrote one), that live value
                // is always authoritative and must never be second-guessed
                // by a possibly-stale persisted one. Never applied to
                // `revealed`/`broken`/`pendingFirstLeave` — those have no
                // cross-restart persistence at all; only `collapsed` does.
                const embedUi = hasImageUiStateEntry(view.state, node.from)
                  ? baseUi
                  : {
                      ...baseUi,
                      collapsed:
                        getFoldStateStore?.()?.getEmbedCollapse(hostPageId, pageResolution.pageId) ??
                        baseUi.collapsed,
                    };
                // The nested view's own extensions are built through the
                // exact same shared factory the top-level editor uses
                // (`buildEditorExtensions.ts`), `readOnly: true` and the
                // extended ancestry threaded through so a further-nested
                // embed inside *this* note is protected identically —
                // never a duplicated rendering/cycle-check mechanism.
                // `hostPageId: pageResolution.pageId` — this resolved
                // embed's own page becomes the "host" for whatever's
                // nested *inside* it, the same one-level-deeper threading
                // `ancestry` already uses (ADR-033's second amendment).
                const noteExtensions = buildEditorExtensions({
                  resolveWikiLink: getResolveWikiLink ?? (() => undefined),
                  resolveEmbedImage: getResolveEmbedImage,
                  resolveEmbedPdf: getResolveEmbedPdf,
                  resolvePageEmbed: getResolvePageEmbed,
                  onImageClick: getOnImageClick,
                  onOpenImageMenu: () => undefined,
                  onPdfEmbedClick: getOnPdfEmbedClick,
                  onOpenPdfMenu: () => undefined,
                  onOpenPage: getOnOpenPage,
                  // More actions is hidden entirely for a nested read-only
                  // note embed (requirement 6) — stubbed the same way
                  // onOpenImageMenu/onOpenPdfMenu are just above.
                  onOpenNoteEmbedMenu: () => undefined,
                  resolveImageSrc: getResolveImageSrc ?? (() => undefined),
                  resolveTag: getResolveTag ?? (() => undefined),
                  resolveDate: getResolveDate ?? (() => undefined),
                  readOnly: true,
                  ancestry: ancestryCheck.ancestry,
                  maxEmbedDepth,
                  getFoldStateStore,
                  hostPageId: pageResolution.pageId,
                });
                const widget = new NoteEmbedWidget(
                  pageResolution,
                  match.path,
                  noteExtensions,
                  embedUi,
                  node.from,
                  node.to,
                  getOnOpenPage ?? (() => undefined),
                  getOnOpenNoteEmbedMenu ?? (() => undefined),
                  getFoldStateStore ?? (() => undefined),
                  hostPageId
                );
                // Same reveal contract Image/PDF already establish: revealed
                // keeps the raw `![[Note]]` text in place and inserts the
                // rendered card as a side widget right after it (Edit
                // source's whole purpose); at rest, the card replaces the
                // raw text outright.
                if (baseUi.revealed) {
                  ranges.push(...markerRanges);
                  ranges.push(Decoration.widget({ widget, side: 1 }).range(node.to));
                } else {
                  const range = Decoration.replace({ widget }).range(node.from, node.to);
                  ranges.push(range);
                  atomicRanges.push(range);
                }
                return;
              }
              // Cycle or depth-limit hit — rendered as a broken note embed
              // below (`resolvePageEmbed` was supplied and named a real page,
              // but recursing into it isn't safe) — never constructs the
              // resolved widget, which is what actually stops the recursion.
            }

            if (resolvePageEmbed) {
              // `resolvePageEmbed` was supplied and consulted (whether or not
              // it actually found a page) — a failed lookup renders as a
              // broken *note* embed (`NoteEmbedWidget.ts`'s own
              // `renderBroken`, reusing the exact shared `invalidEmbedCard.ts`
              // component with a note-specific icon/title) rather than
              // falling through to the generic broken-image rendering below.
              const widget = new NoteEmbedWidget(
                null,
                match.path,
                [],
                { ...baseUi, broken: true },
                node.from,
                node.to,
                getOnOpenPage ?? (() => undefined),
                getOnOpenNoteEmbedMenu ?? (() => undefined),
                getFoldStateStore ?? (() => undefined),
                hostPageId
              );
              if (baseUi.revealed) {
                ranges.push(...markerRanges);
                ranges.push(Decoration.widget({ widget, side: 1 }).range(node.to));
              } else {
                const range = Decoration.replace({ widget }).range(node.from, node.to);
                ranges.push(range);
                atomicRanges.push(range);
              }
              return;
            }
            // Else: no resolvePageEmbed supplied at all — falls through to
            // the generic image-broken rendering below, unchanged.
          }
          // Else: targetKind === 'image' — extension says image, but no
          // VaultResource was found for it at all (`resolution.status ===
          // 'unresolved'`). Never consult page resolution for something
          // whose own extension already says "image" — falls through to
          // the generic broken-image rendering below, which already
          // handles this `resolution.status` correctly.
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
          ranges.push(...markerRanges);
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
 * doc comment on that branch. `resolvePageEmbed`/`onOpenPage` (plus the
 * `resolveWikiLink`/`resolveTag`/`resolveDate`/`resolveImageSrc` forwarded
 * only for a resolved note embed's own nested rendering) are the note-embed
 * counterparts — see `EmbedLivePreviewOptions`'s own field docs.
 */
export function embedLivePreview(options: EmbedLivePreviewOptions): Extension {
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
          options,
          this.pdfDocumentCache
        ));
      }

      update(update: ViewUpdate) {
        const uiChanged = update.startState.field(imageUiStateField) !== update.state.field(imageUiStateField);
        if (update.docChanged || update.viewportChanged || update.selectionSet || uiChanged) {
          ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(
            update.view,
            options,
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
