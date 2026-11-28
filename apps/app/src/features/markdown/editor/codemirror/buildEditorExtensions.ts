import { Compartment, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { readOnlyModeEffect } from './createEditorView';

import { semanticCompletionExtensions } from './completion';
import type { ResolveDate } from './date/dateResolution';
import { emptyLeadingLineDeletion } from './emptyLeadingLineDeletion';
import { markdownEnterKeymap } from './enter/markdownEnterKeymap';
import { markdownIndentKeymap } from './indent/markdownIndentKeymap';
import { orderedListStructuralNormalization } from './list/orderedListStructuralNormalization';
import { formatShortcutsKeymap } from './format/formatShortcutsKeymap';
import { blockquoteLineDecoration } from './highlight/blockquoteLineDecoration';
import { blockquoteMarkerDecoration } from './highlight/blockquoteMarkerDecoration';
import { blockSeparatorDecoration } from './highlight/blockSeparatorDecoration';
import { fencedCodeBackgroundLayer } from './highlight/fencedCodeBackgroundLayer';
import { fencedCodeBlockLineDecoration } from './highlight/fencedCodeBlockLineDecoration';
import { indentedCodeLineDecoration } from './highlight/indentedCodeLineDecoration';
import { fencedCodeActionsButtonDecoration } from './highlight/fencedCodeActionsButtonDecoration';
import { fencedCodeCopyButtonDecoration } from './highlight/fencedCodeCopyButtonDecoration';
import type { OnOpenFencedCodeMenu } from './fencedCode/FencedCodeActionsButtonWidget';
import { fencedCodeLanguageLabelDecoration } from './highlight/fencedCodeLanguageLabelDecoration';
import { fencedCodeMarkerDecoration } from './highlight/fencedCodeMarkerDecoration';
import { headingMarkerDecoration } from './highlight/headingMarkerDecoration';
import { inlinePreviewExtensions, inlineTokenMouseExtensions } from './highlight/inlineLivePreviewRegion';
import { leadingIndentDecoration } from './highlight/leadingIndentDecoration';
import { editorRevealHighlight } from './highlight/editorRevealHighlight';
import { urlPasteChoiceField } from './link/urlPaste/urlPasteChoiceState';
import { urlPasteAnchorDecoration } from './link/urlPaste/urlPasteAnchorDecoration';
import type { OnOpenUrlPasteMenu } from './link/urlPaste/UrlPasteAnchorWidget';
import { listMarkerCaretAssoc, listMarkerDecoration } from './list/listMarkerDecoration';
import { listLineDecoration } from './list/listLineDecoration';
import { taskCheckboxDecoration } from './task/taskCheckboxDecoration';
import { taskCheckboxMouseHandlers } from './task/taskCheckboxMouseHandlers';
import { taskCompletedContentDecoration } from './task/taskCompletedContentDecoration';
import { taskCompletionMetadataDecoration } from './task/taskCompletionMetadataDecoration';
import { hardBreakMarkerDecoration } from './highlight/hardBreakMarkerDecoration';
import { horizontalRuleDecoration } from './hr/horizontalRuleDecoration';
import type { OnImageClick, OnOpenImageMenu } from './image/ImageWidget';
import { imageLivePreview } from './image/imageLivePreview';
import { embedLivePreview } from './embed/embedLivePreview';
import { fencedCodeFenceAutoClose } from './fencedCode/fencedCodeFenceAutoClose';
import { fencedCodeHighlighting } from './fencedCode/fencedCodeHighlighting';
import type { OnOpenPdfMenu, OnPdfEmbedClick } from './pdf/PdfEmbedWidget';
import type { ResolveImageSrc } from './image/imageSrcResolution';
import { markdownLanguageExtension } from './markdownLanguage';
import type { ResolveTag } from './tag/tagResolution';
import type { GetTagSuggestions } from './tag/tagSuggestion';
import type { ResolveWikiLink } from './wikilink/wikiLinkResolution';
import type { GetWikiLinkSuggestions } from './wikilink/wikiLinkSuggestion';
import type { ResolveEmbedImage } from './embed/embedImageResolution';
import type { ResolveEmbedPdf } from './pdf/embedPdfResolution';
import type { ResolvePageEmbed } from '../../render/blocks/pageEmbedResolution';
import type { GetEmbedSuggestions } from './embed/embedSuggestion';
import type { GetHeadingSuggestions } from './completionPopup/headingCompletion';
import { ROOT_ANCESTRY, type NoteEmbedAncestry } from './embed/noteEmbedAncestry';
import type { OnOpenNoteEmbedMenu, FoldStatePersistence } from './embed/NoteEmbedWidget';
import { tableBoundaryNavigation } from './table/tableBoundaryNavigation';
import { tableDeletionSelectionField, tableWholeDeletionKeymap } from './table/tableDeletionSelection';
import type { OnTableHandleMenuChange } from './table/tableHandleMenuSync';
import { externalPasteNormalization } from './paste/externalPaste';
import type { PasteAssets } from './paste/assetPaste';
import { pasteRouting } from './paste/pasteRouting';
import { tableRootSelectionSnap } from './table/tableRootSelectionSnap';
import { tableCellEditor, tableEngineIntegration } from './table-engine/tableCellEditor';
import { selectNewMarkdownTable, tableSelectionHistory } from './table-engine/tableSelectionHistory';
import { tableWidgetDecoration } from './table/tableWidgetField';
import { blockRangeSelection } from './blockRangeSelection';

/**
 * Every getter here follows the same "read fresh per rebuild/per click"
 * freshness pattern the previous inline `MarkdownEditor.tsx` extension
 * list already established (`() => someRef.current`) — this factory
 * doesn't change that contract, it only moves the *construction* of the
 * extension array somewhere both `MarkdownEditor.tsx` (the normal,
 * editable top-level editor) and `NoteEmbedWidget.ts` (a note embed's
 * nested, permanently read-only `EditorView`) can call it identically,
 * so both render through the exact same headings/emphasis/image/PDF/
 * checkbox/embed decorations — the actual product requirement behind
 * this extraction (docs/implementation-rules.md's "reuse, don't
 * duplicate" rule). Only `readOnly: true` differs anything below, and
 * only where a mutating capability (editing keymaps, autocomplete,
 * ordered-list renumbering, the task-checkbox toggle handler) has no
 * meaning in a view that can never be edited — every purely-rendering or
 * purely-navigational (click-to-open, non-mutating) extension is
 * included unconditionally, for both callers.
 */
export interface BuildEditorExtensionsOptions {
  readonly resolveWikiLink: () => ResolveWikiLink | undefined;
  readonly getWikiLinkSuggestions?: () => GetWikiLinkSuggestions | undefined;
  readonly getEmbedSuggestions?: () => GetEmbedSuggestions | undefined;
  readonly getHeadingSuggestions?: () => GetHeadingSuggestions | undefined;
  readonly resolveEmbedImage: () => ResolveEmbedImage | undefined;
  readonly resolveEmbedPdf: () => ResolveEmbedPdf | undefined;
  /**
   * Resolves an `Embed`'s target into a note (vs. image/PDF) — consulted
   * by `embedLivePreview()` only after both resolvers above decline (see
   * that file's own doc comment for exactly where). Omitted entirely (as
   * every pre-note-embed call site already did) simply means `![[Page]]`
   * never resolves to a note embed, falling through to the same
   * already-existing "missing resource" rendering `![[missing.png]]` gets
   * today — never a crash, never a second error path to maintain.
   */
  readonly resolvePageEmbed?: () => ResolvePageEmbed | undefined;
  readonly onImageClick: () => OnImageClick | undefined;
  readonly onOpenImageMenu: () => OnOpenImageMenu | undefined;
  readonly onPdfEmbedClick: () => OnPdfEmbedClick | undefined;
  readonly onOpenPdfMenu: () => OnOpenPdfMenu | undefined;
  /**
   * A note embed's own Expand action (`NoteEmbedWidget.ts`'s header
   * button) — opens the real source note via the existing page-navigation
   * mechanism, the only supported way to edit an embedded note's content,
   * per this milestone's own permanent product rule. Unused when
   * `resolvePageEmbed` is omitted.
   */
  readonly onOpenPage?: () => ((pageId: string, heading?: string) => void) | undefined;
  /** A note embed's own "More actions" trigger (Turn into WikiLink/Remove) — see `NoteEmbedMoreActions.tsx`'s doc comment. Unused when `resolvePageEmbed` is omitted. */
  readonly onOpenNoteEmbedMenu?: () => OnOpenNoteEmbedMenu | undefined;
  /** A fenced code block's own "More actions" trigger (Format code, Change Language, Download, Remove) — see `FencedCodeActionsMenu.tsx`'s doc comment. Omitted (never wired) for a read-only nested view — every one of those actions mutates the document, none has meaning once editing is blocked. */
  readonly onOpenFencedCodeMenu?: () => OnOpenFencedCodeMenu | undefined;
  /** Opens the "Paste as" menu for a just-pasted plain HTTPS URL (Markdown link / URL) — see `UrlPasteMenu.tsx`'s doc comment. Omitted for a read-only nested view — pasting has no meaning once editing is blocked. */
  readonly onOpenUrlPasteMenu?: () => OnOpenUrlPasteMenu | undefined;
  /**
   * A row/column handle's own floating menu (Clear contents / Insert /
   * Delete) — see `TableHandleMenu.tsx`'s doc comment. Unlike every other
   * `onOpenXMenu` above, the same callback also *closes* the menu (called
   * with `null`) — see `OnTableHandleMenuChange`'s own doc comment
   * (`tableHandleMenuSync.ts`). Omitted for a read-only nested view — a note
   * embed's table never gets a handle overlay to open one from in the
   * first place (`tableWidget.ts`'s own `if (this.controller)` gate).
   */
  readonly onOpenTableHandleMenu?: () => OnTableHandleMenuChange | undefined;
  readonly resolveImageSrc: () => ResolveImageSrc | undefined;
  /** Stores pasted images/PDFs as assets. Omitted for a read-only nested view — nothing is pasted there. */
  readonly pasteAssets?: () => PasteAssets | undefined;
  readonly resolveTag: () => ResolveTag | undefined;
  readonly getTagSuggestions?: () => GetTagSuggestions | undefined;
  readonly resolveDate: () => ResolveDate | undefined;
  /**
   * Fires after a task checkbox toggle actually dispatches — unused (and
   * never wired to a mouse handler at all) when `readOnly` is `true`,
   * since a note embed's checkbox can never be toggled in the first
   * place. The top-level editor passes its own `onFlush` here, matching
   * the pre-extraction inline call.
   */
  readonly onTaskCheckboxToggled?: () => void;
  /**
   * `false` for the normal, top-level `MarkdownEditor` (the only caller
   * that ever passes `false` — its own `createEditorView({ readOnly })`
   * call must agree; this factory has no way to enforce that itself).
   * `true` for a note embed's nested view — excludes every editing-only
   * extension (keymaps, autocomplete, ordered-list renumbering, the
   * task-checkbox toggle handler) that has no meaning once
   * `blockReadOnlyEdits`/`EditorView.editable.of(false)`
   * (`createEditorView.ts`) already make document mutation impossible;
   * everything else — every rendering decoration and every non-mutating
   * click handler (WikiLink/Tag/Date/Link/image/PDF-Expand navigation) —
   * is included either way, which is exactly the visual-parity property
   * a note embed needs.
   */
  readonly readOnly: boolean;
  /**
   * Cycle/depth-protection state for recursive note embeds
   * (`noteEmbedAncestry.ts`) — defaults to `ROOT_ANCESTRY` for the
   * top-level editor. A note embed's own nested extensions (built inside
   * `NoteEmbedWidget.ts`) pass the already-extended ancestry
   * `checkNoteEmbedAncestry` returned when this embed itself was
   * constructed, so a cycle or depth-limit anywhere in the chain is
   * caught the same way, one level at a time, regardless of how deep the
   * recursion already is.
   */
  readonly ancestry?: NoteEmbedAncestry;
  readonly maxEmbedDepth?: number;
  /**
   * ADR-033's amendment — forwarded to `embedLivePreview()` so a resolved
   * note embed's own nested view can restore/persist CM6 fold state keyed
   * by the *embedded* page's own `pageId`. See `EmbedLivePreviewOptions`'s
   * own doc comment for the full threading chain (`MarkdownEditor.tsx` →
   * here → `embedLivePreview.ts` → `NoteEmbedWidget`, one level deeper at
   * each further-nested embed).
   */
  readonly getFoldStateStore?: () => FoldStatePersistence | undefined;
  /**
   * ADR-033's second amendment — required, forwarded straight to
   * `embedLivePreview()`; see that file's own `EmbedLivePreviewOptions.
   * hostPageId` doc comment for why there is no safe default.
   */
  readonly hostPageId: string;

}

/**
 * The extension list in the four groups whose position matters, so a top-level editor can swap the
 * mode-dependent ones in place (`buildSwitchableEditorExtensions`) while a note embed — built once,
 * read-only forever — keeps the flat list `buildEditorExtensions` composes from the same groups:
 *
 *  - `before`    editing-only extensions that come ahead of the rendering ones (editable only);
 *  - `rendering` the stable rendering extensions — identical in both modes;
 *  - `table`     the table widget and its controller-dependent extensions (static when read-only);
 *  - `after`     what follows: the editing-only completions and handlers, or — read-only — just the
 *                root-selection snap, which sits after the rendering there and before it when editable.
 *
 * `before + rendering + table + after` is exactly the list this file has always returned.
 */
interface EditorModeParts {
  readonly before: Extension[];
  readonly table: Extension[];
  readonly after: Extension[];
}

/** Construct stable rendering only when building a new view. */
function buildRenderingExtensions(options: Omit<BuildEditorExtensionsOptions, 'readOnly'>): Extension[] {
  const {
    resolveWikiLink,
    resolveEmbedImage,
    resolveEmbedPdf,
    resolvePageEmbed,
    onImageClick,
    onOpenImageMenu,
    onPdfEmbedClick,
    onOpenPdfMenu,
    onOpenPage,
    onOpenNoteEmbedMenu,
    resolveImageSrc,
    resolveTag,
    resolveDate,
    ancestry = ROOT_ANCESTRY,
    maxEmbedDepth,
    getFoldStateStore,
    hostPageId,
  } = options;

  return [
    markdownLanguageExtension(),
    blockRangeSelection(),
    ...fencedCodeHighlighting(),
    inlinePreviewExtensions({ resolveWikiLink, resolveTag, resolveDate }),
    imageLivePreview(onImageClick, onOpenImageMenu, resolveImageSrc),
    embedLivePreview({
      resolveEmbedImage,
      onImageClick,
      onOpenImageMenu,
      resolveEmbedPdf,
      onPdfEmbedClick,
      onOpenPdfMenu,
      resolvePageEmbed,
      onOpenPage,
      onOpenNoteEmbedMenu,
      resolveWikiLink,
      resolveTag,
      resolveDate,
      resolveImageSrc,
      ancestry,
      maxEmbedDepth,
      getFoldStateStore,
      hostPageId,
    }),
    listMarkerDecoration(),
    listMarkerCaretAssoc(),
    listLineDecoration(),
    taskCheckboxDecoration(),
    taskCompletedContentDecoration(),
    taskCompletionMetadataDecoration(),
    blockquoteMarkerDecoration(),
    hardBreakMarkerDecoration(),
    blockquoteLineDecoration(),
    headingMarkerDecoration(),
    fencedCodeBackgroundLayer(),
    fencedCodeBlockLineDecoration(),
    indentedCodeLineDecoration(),
    fencedCodeMarkerDecoration(),
    fencedCodeLanguageLabelDecoration(),
    fencedCodeCopyButtonDecoration(),
    horizontalRuleDecoration(),
    blockSeparatorDecoration(),
    leadingIndentDecoration(),
    inlineTokenMouseExtensions({ resolveWikiLink, resolveTag, resolveDate }),
  ];
}

/** Only these groups are reconfigured when a live editor changes mode. */
function buildModeExtensions(options: BuildEditorExtensionsOptions): EditorModeParts {
  const {
    resolveWikiLink,
    getWikiLinkSuggestions,
    getEmbedSuggestions,
    getHeadingSuggestions,
    onOpenFencedCodeMenu,
    onOpenUrlPasteMenu,
    onOpenTableHandleMenu,
    pasteAssets: getPasteAssets,
    resolveTag,
    getTagSuggestions,
    resolveDate,
    onTaskCheckboxToggled,
    readOnly,
  } = options;

  const table: Extension[] = [
    // Static cells in both modes use the same live resolver getters as prose.
    tableEngineIntegration.of({ getPasteAssets, getTagSuggestions, getWikiLinkSuggestions, getHeadingSuggestions, getOnOpenUrlPasteMenu: onOpenUrlPasteMenu, resolvers: { resolveWikiLink, resolveTag, resolveDate } }),
    ...(!readOnly ? [
      tableCellEditor,
      tableSelectionHistory,
      selectNewMarkdownTable,
      EditorView.updateListener.of(update => {
        const controller = update.view.plugin(tableCellEditor);
        controller?.restoreHistory();
        if (update.selectionSet || update.docChanged || update.focusChanged) controller?.repairRootFocus();
      }),
      tableBoundaryNavigation(),
    ] : []),
    tableWidgetDecoration(!readOnly, () => onOpenTableHandleMenu?.()),
    tableDeletionSelectionField,
  ];

  if (readOnly) return { before: [], table, after: [tableRootSelectionSnap()] };

  const before: Extension[] = [
    tableRootSelectionSnap(),
    markdownEnterKeymap(),
    markdownIndentKeymap(),
    orderedListStructuralNormalization(),
    pasteRouting(getPasteAssets ?? (() => undefined)),
    externalPasteNormalization(),
    // Leading blank-line deletion takes precedence over whole-table arming.
    emptyLeadingLineDeletion(),
    tableWholeDeletionKeymap(),
    fencedCodeFenceAutoClose(),
    // Editable-only: `MarkdownEditor.tsx`'s `revealRange`/`revealRanges`
    // (Tasks sidebar's "Show in note", Tag collection's "Open note") are
    // only ever called against the top-level editable view, never a note
    // embed's read-only nested one.
    editorRevealHighlight(),
  ];

  const after: Extension[] = [
    // The trigger itself only opens a menu, but every one of its current
    // menu items (Format code, Change Language, Download, Remove) mutates
    // the document except Download — kept out of `rendering` entirely
    // (full exclusion, not option-gating the callback the way
    // `onOpenNoteEmbedMenu` is) so a note embed's read-only nested view
    // never carries it.
    fencedCodeActionsButtonDecoration(() => onOpenFencedCodeMenu?.()),
    // "Paste as" menu for a bare pasted HTTPS URL: paste detection/
    // tracking (the state field) and the transient menu anchor. Editable-
    // only, same reasoning as fencedCodeActionsButtonDecoration above —
    // pasting has no meaning in a permanently read-only nested note-embed
    // view.
    urlPasteChoiceField,
    urlPasteAnchorDecoration(() => onOpenUrlPasteMenu?.()),
    formatShortcutsKeymap(),
    taskCheckboxMouseHandlers(() => onTaskCheckboxToggled?.()),
    semanticCompletionExtensions({ getWikiLinkSuggestions, getTagSuggestions, getEmbedSuggestions, getHeadingSuggestions }),
  ];

  return { before, table, after };
}

/** The flat list — a note embed's nested view (read-only, never switched) and any caller that does not switch modes. */
export function buildEditorExtensions(options: BuildEditorExtensionsOptions): Extension[] {
  const rendering = buildRenderingExtensions(options);
  const { before, table, after } = buildModeExtensions(options);

  return [...before, ...rendering, ...table, ...after];
}

/**
 * The compartments a top-level editor's mode-dependent groups live in. One set is enough for every view:
 * a compartment is only an identity, and each state tracks its own contents.
 */
const editingBeforeCompartment = new Compartment();
const tableModeCompartment = new Compartment();
const editingAfterCompartment = new Compartment();

/**
 * The same list as `buildEditorExtensions`, in the same order, but with the three mode-dependent groups in
 * compartments so `switchEditorMode` can swap them on a live view. `trailingWhenEditable` is appended to
 * the editing-only tail (the exit-up keymap, which follows everything else when editable and is absent
 * when read-only). The stable rendering extensions stay outside, so their state survives a switch.
 */
export function buildSwitchableEditorExtensions(
  options: Omit<BuildEditorExtensionsOptions, 'readOnly'>,
  readOnly: boolean,
  trailingWhenEditable: readonly Extension[] = []
): Extension[] {
  const rendering = buildRenderingExtensions(options);
  const parts = buildModeExtensions({ ...options, readOnly });

  return [
    editingBeforeCompartment.of(parts.before),
    ...rendering,
    tableModeCompartment.of(parts.table),
    editingAfterCompartment.of(readOnly ? parts.after : [...parts.after, ...trailingWhenEditable]),
  ];
}

/**
 * Switches a live view between editable and read-only without rebuilding it: the read-only/editable facets,
 * the editing-only groups and the table group are reconfigured in ONE transaction. Everything outside those
 * compartments — history, folds, selection, scroll, the rendering extensions and their state — is untouched.
 * Takes no focus. (A switch into read-only also needs the host to dismiss editing UI that lives outside
 * CodeMirror.)
 */
export function switchEditorMode(
  view: EditorView,
  options: Omit<BuildEditorExtensionsOptions, 'readOnly'>,
  readOnly: boolean,
  trailingWhenEditable: readonly Extension[] = []
): void {
  const parts = buildModeExtensions({ ...options, readOnly });

  view.dispatch({
    effects: [
      readOnlyModeEffect(readOnly),
      editingBeforeCompartment.reconfigure(parts.before),
      tableModeCompartment.reconfigure(parts.table),
      editingAfterCompartment.reconfigure(readOnly ? parts.after : [...parts.after, ...trailingWhenEditable]),
    ],
  });
}
