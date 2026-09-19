import type { Extension } from '@codemirror/state';

import { semanticCompletion } from './completion';
import { dateAutocomplete } from './date/dateAutocomplete';
import { dateMouseHandlers } from './date/dateMouseHandlers';
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
import { fencedCodeActionsButtonDecoration } from './highlight/fencedCodeActionsButtonDecoration';
import { fencedCodeCopyButtonDecoration } from './highlight/fencedCodeCopyButtonDecoration';
import type { OnOpenFencedCodeMenu } from './fencedCode/FencedCodeActionsButtonWidget';
import { fencedCodeLanguageLabelDecoration } from './highlight/fencedCodeLanguageLabelDecoration';
import { fencedCodeMarkerDecoration } from './highlight/fencedCodeMarkerDecoration';
import { headingMarkerDecoration } from './highlight/headingMarkerDecoration';
import { createInlineLivePreviewParticipants } from './highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from './highlight/inlineLivePreviewRegion';
import { leadingIndentDecoration } from './highlight/leadingIndentDecoration';
import { linkMouseHandlers } from './link/linkMouseHandlers';
import { urlMouseHandlers } from './link/urlMouseHandlers';
import { urlPasteChoiceField } from './link/urlPaste/urlPasteChoiceState';
import { urlPasteAnchorDecoration } from './link/urlPaste/urlPasteAnchorDecoration';
import type { OnOpenUrlPasteMenu } from './link/urlPaste/UrlPasteAnchorWidget';
import { listMarkerCaretAssoc, listMarkerDecoration } from './list/listMarkerDecoration';
import { taskCheckboxDecoration } from './task/taskCheckboxDecoration';
import { taskCheckboxMouseHandlers } from './task/taskCheckboxMouseHandlers';
import { taskCompletedContentDecoration } from './task/taskCompletedContentDecoration';
import { taskCompletionMetadataDecoration } from './task/taskCompletionMetadataDecoration';
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
import { tagAutocomplete } from './tag/tagAutocomplete';
import { tagMouseHandlers } from './tag/tagMouseHandlers';
import type { ResolveWikiLink } from './wikilink/wikiLinkResolution';
import type { GetWikiLinkSuggestions } from './wikilink/wikiLinkSuggestion';
import { wikiLinkAutocomplete } from './wikilink/wikiLinkAutocomplete';
import { embedAutocomplete } from './embed/embedAutocomplete';
import { wikiLinkLivePreview } from './wikilink/wikiLinkLivePreview';
import { wikiLinkMouseHandlers } from './wikilink/wikiLinkMouseHandlers';
import type { ResolveEmbedImage } from './embed/embedImageResolution';
import type { ResolveEmbedPdf } from './pdf/embedPdfResolution';
import type { ResolvePageEmbed } from '../../render/blocks/pageEmbedResolution';
import type { GetEmbedHeadingSuggestions, GetEmbedSuggestions } from './embed/embedSuggestion';
import { ROOT_ANCESTRY, type NoteEmbedAncestry } from './embed/noteEmbedAncestry';
import type { OnOpenNoteEmbedMenu, FoldStatePersistence } from './embed/NoteEmbedWidget';
import { tableActiveCellReconciliation, type TableActiveCellController } from './table/tableActiveCellController';
import { tableActivationNormalization } from './table/tableActivationNormalization';
import { tableBoundaryNavigation } from './table/tableBoundaryNavigation';
import { tableDeletionSelectionField, tableWholeDeletionKeymap } from './table/tableDeletionSelection';
import { tableRootSelectionSnap } from './table/tableRootSelectionSnap';
import { tableSelectionField } from './table/tableSelection';
import { tableSelectionDeletionKeymap } from './table/tableSelectionDeletion';
import { tableWidgetDecoration } from './table/tableWidgetField';

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
  readonly getEmbedHeadingSuggestions?: () => GetEmbedHeadingSuggestions | undefined;
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
  readonly onOpenPage?: () => ((pageId: string) => void) | undefined;
  /** A note embed's own "More actions" trigger (Turn into WikiLink/Remove) — see `NoteEmbedMoreActions.tsx`'s doc comment. Unused when `resolvePageEmbed` is omitted. */
  readonly onOpenNoteEmbedMenu?: () => OnOpenNoteEmbedMenu | undefined;
  /** A fenced code block's own "More actions" trigger (Format code, Change Language, Download, Remove) — see `FencedCodeActionsMenu.tsx`'s doc comment. Omitted (never wired) for a read-only nested view — every one of those actions mutates the document, none has meaning once editing is blocked. */
  readonly onOpenFencedCodeMenu?: () => OnOpenFencedCodeMenu | undefined;
  /** Opens the "Paste as" menu for a just-pasted plain HTTPS URL (Markdown link / URL) — see `UrlPasteMenu.tsx`'s doc comment. Omitted for a read-only nested view — pasting has no meaning once editing is blocked. */
  readonly onOpenUrlPasteMenu?: () => OnOpenUrlPasteMenu | undefined;
  readonly resolveImageSrc: () => ResolveImageSrc | undefined;
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
  /**
   * The table active-cell controller (Architecture E, ADR-034 —
   * docs/table-implementation-plan.md, M5) — `undefined` for the
   * top-level editor's very first render before its controller ref is
   * populated, and *always* omitted for a note embed's own read-only
   * nested view. Consulted only when `readOnly` is `false`: a read-only
   * table still renders as a real `<table>` (`tableWidgetDecoration()` is
   * in the always-included `rendering` array below, unconditionally),
   * but never gets a controller to activate a cell with, so it never
   * gets a click handler either — the same "omit the capability
   * entirely" gate every other editing-only extension in this factory
   * already uses, extended here rather than a second gating mechanism
   * (§9/Cross-check's own "never a nested `EditorView` for a read-only
   * embed" requirement).
   */
  readonly getTableActiveCellController?: () => TableActiveCellController | undefined;
}

export function buildEditorExtensions(options: BuildEditorExtensionsOptions): Extension[] {
  const {
    resolveWikiLink,
    getWikiLinkSuggestions,
    getEmbedSuggestions,
    getEmbedHeadingSuggestions,
    resolveEmbedImage,
    resolveEmbedPdf,
    resolvePageEmbed,
    onImageClick,
    onOpenImageMenu,
    onPdfEmbedClick,
    onOpenPdfMenu,
    onOpenPage,
    onOpenNoteEmbedMenu,
    onOpenFencedCodeMenu,
    onOpenUrlPasteMenu,
    resolveImageSrc,
    resolveTag,
    getTagSuggestions,
    resolveDate,
    onTaskCheckboxToggled,
    readOnly,
    ancestry = ROOT_ANCESTRY,
    maxEmbedDepth,
    getFoldStateStore,
    hostPageId,
    getTableActiveCellController,
  } = options;

  // `undefined` for a read-only table (a note embed) regardless of what
  // `getTableActiveCellController` itself would return — the `!readOnly`
  // gate is enforced here, once, rather than trusting every call site to
  // pass the option correctly. `tableWidgetDecoration()` still renders a
  // real `<table>` either way (below, unconditional); only activation
  // capability is withheld.
  const tableActiveCellController = readOnly ? undefined : getTableActiveCellController?.();

  const rendering: Extension[] = [
    markdownLanguageExtension(),
    ...fencedCodeHighlighting(),
    inlineLivePreviewRegion(
      createInlineLivePreviewParticipants({
        resolveTag,
        resolveDate,
      })
    ),
    wikiLinkLivePreview(resolveWikiLink),
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
    taskCheckboxDecoration(),
    taskCompletedContentDecoration(),
    taskCompletionMetadataDecoration(),
    blockquoteMarkerDecoration(),
    blockquoteLineDecoration(),
    headingMarkerDecoration(),
    fencedCodeBackgroundLayer(),
    fencedCodeBlockLineDecoration(),
    fencedCodeMarkerDecoration(),
    fencedCodeLanguageLabelDecoration(),
    fencedCodeCopyButtonDecoration(),
    horizontalRuleDecoration(),
    blockSeparatorDecoration(),
    leadingIndentDecoration(),
    wikiLinkMouseHandlers(resolveWikiLink),
    tagMouseHandlers(resolveTag),
    dateMouseHandlers(resolveDate),
    linkMouseHandlers(),
    urlMouseHandlers(),
    tableWidgetDecoration(tableActiveCellController),
    // Always installed alongside `tableWidgetDecoration()` (unconditional,
    // not gated on `tableActiveCellController`) — `buildTableWidgetRange`
    // reads this field on every rebuild via `state.field(...)`, which
    // requires the field to be present in the config even for a read-only
    // note embed (whose value there just always stays `null`, since only
    // `tableWholeDeletionKeymap()` below — editable-only — ever writes to
    // it). See `tableDeletionSelection.ts`'s own doc comment.
    tableDeletionSelectionField,
    // Unconditional for the identical reason `tableDeletionSelectionField`
    // above already is — `buildTableWidgetRange` reads it via
    // `state.field(...)` on every rebuild regardless of `readOnly`, and a
    // read-only note embed's table never gets a handle overlay to write to
    // it in the first place (`tableWidget.ts`'s own `if (this.controller)`
    // gate), so its value there just always stays `null`. See
    // `tableSelection.ts`'s own doc comment.
    tableSelectionField,
    // Unconditional (not gated on `tableActiveCellController`), same as
    // `tableWidgetDecoration`/`tableDeletionSelectionField` above — a
    // read-only note embed can still receive a selection landing inside a
    // rendered table's replaced range (a click, a drag) even though it can
    // never edit one, so the same root-selection invariant applies there
    // too. See `tableRootSelectionSnap.ts`'s own doc comment.
    tableRootSelectionSnap(),
    ...(tableActiveCellController
      ? [tableActiveCellReconciliation(tableActiveCellController), tableBoundaryNavigation(tableActiveCellController)]
      : []),
  ];

  if (readOnly) {
    // No document-changing command has any meaning once
    // `createEditorView({ readOnly: true })`'s own `blockReadOnlyEdits`
    // already blocks every doc-changing transaction — omitted here so a
    // note embed's nested view carries no dead keymap/completion/
    // normalization machinery, per this milestone's own "keep the
    // reusable mechanism minimal" instruction, not because any of it
    // would behave incorrectly if left in.
    return rendering;
  }

  return [
    markdownEnterKeymap(),
    markdownIndentKeymap(),
    orderedListStructuralNormalization(),
    tableActivationNormalization(),
    // Listed before `tableWholeDeletionKeymap()` — both are `Prec.highest`;
    // this one must win the tie at the one position they can both match
    // (an empty first line immediately above a table). See
    // `emptyLeadingLineDeletion.ts`'s own doc comment.
    emptyLeadingLineDeletion(),
    // Listed before `tableWholeDeletionKeymap()` — both `Prec.highest` on
    // Backspace/Delete; mutually exclusive in practice (this one only fires
    // when a `TableSelection` is active, the other only from a caret
    // adjacent to a table with none active), but ordered explicitly rather
    // than left to incidental tie-breaking. See `tableSelectionDeletion.ts`'s
    // own doc comment.
    tableSelectionDeletionKeymap(),
    tableWholeDeletionKeymap(),
    fencedCodeFenceAutoClose(),
    ...rendering,
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
    wikiLinkAutocomplete(),
    embedAutocomplete(),
    tagAutocomplete(),
    dateAutocomplete(),
    semanticCompletion(
      getWikiLinkSuggestions ?? (() => undefined),
      getTagSuggestions ?? (() => undefined),
      getEmbedSuggestions ?? (() => undefined),
      getEmbedHeadingSuggestions ?? (() => undefined)
    ),
  ];
}
