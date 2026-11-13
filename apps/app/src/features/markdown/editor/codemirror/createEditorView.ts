import { tripleClickLineSelection } from './tripleClickLineSelection';
import { singleQuoteMarkerInput } from './closeBracketsQuoteMarker';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  history,
  historyField,
  historyKeymap,
  indentWithTab,
  isolateHistory,
  undoDepth,
} from '@codemirror/commands';
import {
  codeFolding,
  foldEffect,
  foldState,
  indentUnit,
} from '@codemirror/language';
import {
  Compartment,
  EditorState,
  type EditorSelection,
  type Extension,
  type StateEffect,
} from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
} from '@codemirror/view';

import {
  editorHistoryCompartment,
  externalSync,
  externalSyncTransactions,
  localHistoryFootprint,
  type HistoryRange,
} from './externalEditorSync';
import { cspNonceExtension } from './cspNonce';
import { editorTheme } from './editorTheme';
import { fencedCodeHoverMouseHandlers } from './fencedCode/fencedCodeHoverMouseHandlers';
import { editorDefaultKeymap } from './editorDefaultKeymap';
import { foldAwareArrowKeymap } from './fold/foldAwareArrowKeymap';
import { foldAwareMoveLineKeymap } from './fold/foldAwareMoveLineKeymap';
import { foldSemanticsKeymap } from './fold/foldSemanticsKeymap';
import { foldToggleDecoration } from './fold/foldToggleDecoration';
import { indentedParagraphFoldService } from './fold/indentedParagraphFoldService';
import { listItemFoldService } from './fold/listItemFoldService';
import { INDENT_UNIT_STRING } from './indent/markdownIndentContext';
import {
  metadataHistoryStep,
  type MetadataHistoryChange,
} from './metadataHistoryStep';
// `headingMarkerDecoration()` is wired for real now, via `MarkdownEditor.tsx`'s
// own extension list, not here. `markdownHighlighting()`/`markdownHighlightStyle`
// (the stale commented-out import that used to sit here) was retired
// outright — per docs/editor-architecture-decisions.md's "markdownHighlighting()
// retired" entry, every tag it mapped (heading1-6, emphasis, strong,
// strikethrough, highlight, monospace) already had a dedicated Live Preview
// decoration owner, making it a standing duplicate-ownership risk with no
// safe remaining purpose, not a harmless dormant extension.

/**
 * Read-only support (docs/editor-architecture-decisions.md, "Note
 * embeds: nested read-only `EditorView`..."). Not a toggleable Compartment
 * — this app has no product-level Edit/Read mode for the normal,
 * top-level note; the only consumer of `readOnly` is a note embed's
 * nested `EditorView` (`NoteEmbedWidget.ts`), which is always constructed
 * read-only and never toggled afterward, so a plain, fixed-at-construction
 * extension pair is the smaller, correct mechanism — a `Compartment`
 * would be unnecessary complexity for a value that never changes after
 * construction.
 */
const readOnlyCompartment = new Compartment();

/**
 * The effect that flips a live view between editable and read-only — `EditorState.readOnly` and
 * `EditorView.editable` together, in the compartment `createEditorView` put them in. Dispatch it with
 * the other mode-dependent reconfigurations in one transaction (`switchEditorMode`).
 */
export function readOnlyModeEffect(readOnly: boolean): StateEffect<unknown> {
  return readOnlyCompartment.reconfigure(readOnlyExtensions(readOnly));
}

function readOnlyExtensions(readOnly: boolean): Extension[] {
  return [
    // Disables CM6's own built-in editing commands (keymaps/history) — a
    // convention those commands check themselves; it does not, on its
    // own, block a raw `view.dispatch({changes: ...})` call from
    // application code (Clutter's own custom keymap commands, or a
    // widget's button handler). `blockReadOnlyEdits` below is the actual,
    // single enforcement point for that.
    EditorState.readOnly.of(readOnly),
    // Toggles `contenteditable` on the editor's content DOM — a rendering-
    // layer setting only; decorations/widgets render identically either
    // way, which is exactly the visual-parity property Read Mode needs.
    // MarkdownEditor.css keys its own Read Mode control-hiding rules off
    // this same native attribute.
    EditorView.editable.of(!readOnly),
  ];
}

/**
 * The one, central enforcement point for "no mutation while read-only" —
 * deliberately not left to each individual command/widget to check
 * `state.readOnly` itself (an audit of every custom keymap command in
 * this codebase found none of them do). A `transactionFilter` sees every
 * transaction regardless of what produced it — a keymap command, a
 * widget's button `view.dispatch()` call, anything — so this one check
 * is a robust backstop even if a future mutating control forgets its own
 * read-only awareness. The one exemption is `externalSync` (see the filter
 * below): a note embed's nested view is rebuilt rather than synced when its
 * content changes, but an archived note's long-lived read-only editor is
 * synced.
 */
const blockReadOnlyEdits = EditorState.transactionFilter.of((tr) =>
  // `externalSync` is the host re-aligning the view with the stored document (`syncMarkdownIntoView`):
  // not a user edit, and a read-only view of a page that changes elsewhere (a tag rename that reaches
  // an archived note) must follow it. Every other document change stays blocked.
  tr.startState.readOnly && tr.docChanged && !tr.annotation(externalSync)
    ? []
    : tr
);

export interface CreateEditorViewOptions {
  readonly doc: string;
  readonly parent: HTMLElement;
  readonly extensions?: readonly Extension[];
  readonly onDocChange?: (markdown: string) => void;
  /**
   * Called with the metadata patch to apply when the user undoes or redoes an edit that was made together
   * with a metadata change (see `applyBodyWithMetadataStep`).
   */
  readonly onMetadataHistoryStep?: (change: MetadataHistoryChange) => void;
  readonly onBlur?: () => void;
  /**
   * Asked, live, before every user edit is applied: `false` refuses it, exactly as `readOnly` does, so the view
   * never gets ahead of a host that would reject the edit (`PageOperations.commitEdit` throws for an archived
   * page, and `readOnly` only follows after React has rendered the archive). Refusing here, where transactions
   * are dispatched (so undo and redo are covered, which bypass transaction filters), leaves no state to repair:
   * no document change, no history entry, the selection untouched. Does not apply to `externalSync`
   * transactions (the host realigning the view).
   */
  readonly canEdit?: () => boolean;
  /**
   * Defaults to editable (`false`). Fixed for this view's lifetime — the
   * only caller that passes `true` (`NoteEmbedWidget.ts`, a note embed's
   * nested `EditorView`) never toggles it afterward, so there is no
   * corresponding "change it later" API; a caller that genuinely needed
   * that would construct a fresh `EditorView` instead, the same way any
   * other CM6 option here would be changed.
   */
  readonly readOnly?: boolean;
  /**
   * Whether CM6 fold state/commands/UI (`codeFolding()`,
   * `foldToggleDecoration()`, `foldKeymap`, `foldAwareArrowKeymap`) are
   * installed — deliberately independent of `readOnly` (ADR-033's
   * amendment): folding is non-mutating (CM6's fold commands never change
   * document text; `blockReadOnlyEdits`/`EditorView.editable.of(false)`
   * are gated purely on `readOnly` and completely unaffected by this
   * option), so a view can be both permanently read-only AND independently
   * foldable — a note embed's nested view (`NoteEmbedWidget.ts`) is the
   * first caller to do both at once. Defaults to `!readOnly`, preserving
   * every existing call site's exact prior behavior (the top-level editor,
   * `readOnly: false`, keeps folding; nothing else changes for it).
   */
  readonly enableFolding?: boolean;
  /**
   * A per-note, in-memory snapshot. Its original state is reconciled to `doc` before mounting using the same
   * external-sync mapping and overlap policy as a live editor. Unknown legacy snapshots restore only against
   * identical text. No stale document is shown and the snapshot is never mutated.
   */
  readonly restoreHistory?: EditorHistorySnapshot;
  /** A cached pixel scroll effect, restored only for identical text; history/selection may be mapped separately. */
  readonly restoreScrollEffect?: StateEffect<unknown>;
  /**
   * A previous `serializeFoldState()` snapshot for this exact document
   * (ADR-033) — typically `application.foldStateStore.get(pageId)`,
   * retrieved right before this view is constructed. Validated with the
   * same exact-text gate used for scroll restoration, but applied
   * independently of it (a separate `view.dispatch` right after
   * construction, not merged into the same `EditorState.fromJSON` call):
   * `restoreHistory` comes from the session-lifetime
   * `editorHistoryCache` (reset every app restart) while this comes from
   * `FoldStateStore` (durable across restarts) — two sources with
   * genuinely different lifetimes and independent staleness outcomes, so
   * one being stale must never suppress restoring the other. See
   * ADR-033's Alternatives Considered for the full reasoning.
   */
  readonly restoreFoldJSON?: unknown;
  /**
   * Whether `history()`/`historyKeymap` are installed — defaults to
   * `true`, preserving both existing callers' exact prior behavior
   * (neither previously had a way to opt out; `history()` was added
   * unconditionally below). The table active-cell nested `EditorView`
   * (Architecture E, ADR-034 — docs/table-implementation-plan.md, M2) is
   * the first caller to pass `false`: root CM6 must remain the sole
   * undo/redo history owner, so the nested editor has no independent
   * history field at all — not merely one that's never invoked — and its
   * own keymap instead delegates `Mod-z`/`Mod-y` straight to `undo`/`redo`
   * on the root view (`TableActiveCellController`).
   */
  readonly enableHistory?: boolean;
}

/**
 * Constructs and mounts a CM6 `EditorView`. No Markdown language or
 * semantic-token behavior — this is the plain-text CM6 foundation other
 * modules build on incrementally. `editorTheme()` and `highlightActiveLine()`
 * are the exceptions, wired here rather than left to each caller's own
 * extension list: baseline visual wiring applicable regardless of which
 * Markdown grammar extensions (`markdownLanguageExtension()` et al.) a
 * caller passes in via `extensions`, not feature behavior of their own.
 * `highlightActiveLine()` is CM6's own built-in extension
 * (`@codemirror/view`) — it only adds a `cm-activeLine` class for the
 * active-line background highlight (`editorTheme.ts`); heading Live
 * Preview hide/reveal no longer depends on it (`headingMarkerDecoration()`,
 * wired by `MarkdownEditor.tsx`, uses selection-containment engagement
 * instead, matching every other Markdown construct — see
 * `highlight/liveMarkDecoration.ts`'s doc comment for why line-granularity
 * CSS hiding was replaced).
 */
export function createEditorView(options: CreateEditorViewOptions): EditorView {
  const {
    doc,
    parent,
    extensions = [],
    onDocChange,
    onMetadataHistoryStep,
    onBlur,
    canEdit,
    restoreHistory,
    restoreScrollEffect,
    restoreFoldJSON,
    readOnly = false,
    enableFolding = !readOnly,
    enableHistory = true,
  } = options;

  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) {
      return;
    }

    const isExternalSync = update.transactions.some((tr) =>
      tr.annotation(externalSync)
    );
    if (isExternalSync) {
      return;
    }

    onDocChange?.(update.state.doc.toString());
  });

  const blurHandler = EditorView.domEventHandlers({
    blur() {
      onBlur?.();
    },
  });

  const allExtensions = [
      updateListener,
      blurHandler,
      readOnlyCompartment.of(readOnlyExtensions(readOnly)),
      blockReadOnlyEdits,
      // Synchronizes CM6's own generic `indentUnit` facet to Clutter's
      // canonical indentation-unit constant (`INDENT_STEP_SPACES`,
      // `indent/markdownIndentContext.ts`) — the single point that keeps
      // every CM6-internal indentation-aware command (Backspace's
      // whitespace-only-prefix deletion via `deleteCharBackward`, Enter's
      // `insertNewlineAndIndent` fallback, `markdownEnterKeymap.ts`'s own
      // `exitEmptyIndentContinuation`, and `indentSelection`, reachable
      // directly via Cmd-Alt-\, unshadowed by `markdownIndentKeymap()`'s
      // own Tab/Shift-Tab bindings; Cmd+]/Cmd+[ are no longer bound here,
      // they are Go forward / Go back: see `editorDefaultKeymap.ts`) agrees with Clutter's own Tab/
      // Shift-Tab step, confirmed by a full repository-wide audit that
      // every one of those call sites reads this facet and none hardcodes
      // a space count of its own. `markdownIndentKeymap()` itself never
      // reads this facet — it reads `INDENT_STEP_SPACES` directly — so
      // this line's only job is keeping CM6's *own* internal commands in
      // sync with that same constant, not supplying Clutter's own value.
      indentUnit.of(INDENT_UNIT_STRING),
      // editorTheme() and highlightActiveLine() are kept: baseline editor
      // chrome (caret color, active-line background), not Markdown-specific
      // Live Preview decoration — neither restructures the DOM around a
      // construct the way headingMarkerDecoration() (wired in
      // MarkdownEditor.tsx, not here) does, and disabling them would just
      // make the editor hard to see.
      // So CodeMirror's injected <style> elements are allowed by a packaged Tauri build's CSP (see cspNonce.ts).
      cspNonceExtension(),
      editorTheme(),
      highlightActiveLine(),
      // Current rendering baseline: CM6 draws its own cursor/selection
      // instead of relying on WKWebView's native contenteditable caret,
      // which was confirmed (diagnostic red caret-color test) to leave a
      // stale/duplicate caret artifact on Backspace in Tauri/WKWebView.
      // `.cm-content { caret-color }` (editorTheme.ts) becomes irrelevant
      // for the caret itself once this hides the native one; `.cm-cursor`
      // styling (MarkdownEditor.css) is what's visible now.
      drawSelection(),
      // Triple-click selects the line's text, not its line break (see tripleClickLineSelection.ts).
      tripleClickLineSelection(),
      EditorView.lineWrapping,
      editorHistoryCompartment.of(enableHistory ? history() : []),
      ...(enableHistory ? [localHistoryFootprint, metadataHistoryStep((change) => onMetadataHistoryStep?.(change))] : []),
      EditorState.allowMultipleSelections.of(true),
      // Purely visual/pointer standard CM6 extensions — no keymap, no
      // change to Backspace/Enter/Delete/Tab/Arrow handling. highlightSpecialChars()
      // renders otherwise-invisible characters (stray non-breaking spaces,
      // control characters) as a visible placeholder glyph. dropCursor()
      // shows a drop-target caret when dragging text into the editor.
      //
      // Deliberately NOT wired (all standard @codemirror/language or
      // @codemirror/view extensions, drop-in with a single import + one
      // line here if a concrete need shows up):
      //   - bracketMatching() [@codemirror/language] — highlights the
      //     matching bracket when the cursor sits next to one.
      //   - rectangularSelection() [@codemirror/view] — Alt-drag box
      //     (column) selection, e.g. for editing pipe-table columns.
      //   - crosshairCursor() [@codemirror/view] — swaps the mouse pointer
      //     to a crosshair while rectangularSelection()'s Alt-drag is
      //     active; only meaningful paired with it.
      // None currently have a feature depending on them.
      highlightSpecialChars(),
      dropCursor(),
      // closeBrackets() auto-closes ()/[]/{}/quotes and skips over an
      // already-present closing char when typed — standard
      // @codemirror/autocomplete behavior, unmodified. Verified against
      // WikiLink syntax: typing `[[Page]]` still produces exactly
      // `[[Page]]` (the auto-close on the first `[[` and the type-over
      // skip on the trailing `]]` cancel out), and wikiLinkAutocomplete's
      // own `[[`-trigger detection is unaffected since it reads the text
      // immediately before the cursor, which still reads `[[` either way.
      // A typed `"` with nothing selected is Clutter's quote marker: one character, never the `""` pair. It must
      // come first; with a selection it declines, so `closeBrackets()` still wraps the selection in `"…"`. See
      // `closeBracketsQuoteMarker.ts`.
      singleQuoteMarkerInput(),
      closeBrackets(),
      // codeFolding() is the fold state/commands; foldToggleDecoration()
      // (codemirror/fold/foldToggleDecoration.ts) is Clutter's own inline,
      // hover-revealed toggle UI for it, replacing @codemirror/language's
      // native foldGutter() column entirely — see that file's own doc
      // comment for the full division of labor (CM6 owns fold state/
      // mechanics unmodified; this only places/dispatches). Headings/
      // lists/fenced-code consume exactly the foldNodeProp/foldService
      // data markdownLanguageExtension() already gets for free from
      // @codemirror/lang-markdown; indentedParagraphFoldService() (Phase
      // 3) is the one genuinely Clutter-authored fold *detection* surface
      // — indentation-based paragraph hierarchy has no CommonMark/parser
      // backing at all, so nothing upstream could provide it — see that
      // file's own doc comment for why it's a physical-line scan, not a
      // syntax-tree-boundary one.
      //
      // Gated on `enableFolding`, independent of `readOnly` (ADR-033's
      // amendment) — a note embed's nested view (`NoteEmbedWidget.ts`)
      // passes `readOnly: true, enableFolding: true` together: folding
      // (CM6's own fold commands, never document-mutating) is compatible
      // with permanent read-only-ness, unlike every other capability
      // `readOnly` still excludes (editing keymaps, autocomplete). Omitted
      // entirely (not merely hidden) only when `enableFolding` is false —
      // meaning there is no fold *state* to expand either in that case,
      // genuinely unfoldable, not just visually hiding a control a
      // keyboard shortcut (`foldKeymap`, below) could still reach.
      ...(enableFolding
        ? [
            codeFolding(),
            indentedParagraphFoldService(),
            listItemFoldService(),
            foldToggleDecoration(),
            fencedCodeHoverMouseHandlers(),
          ]
        : []),
      ...extensions,
      // Lowest-priority keymap (added last), so any higher-precedence
      // binding in `extensions` above still wins when it applies. Without
      // this, Enter had no CM6-level binding at all and fell through to
      // the browser's native contentEditable paragraph-split behavior,
      // which CM6 then had to reconcile via DOM-mutation observation — the
      // actual source of the double-newline and stuck-until-refocus
      // symptoms, not a CSS or focus-handling issue.
      //
      // closeBracketsKeymap's only binding is Backspace (deleteBracketPair,
      // for deleting an empty auto-inserted pair in one press) — placed
      // ahead of defaultKeymap per CM6's own documented precedence
      // convention, but it only fires for that one empty-pair case;
      // defaultKeymap's deleteCharBackward still handles every other
      // Backspace press exactly as before.
      //
      // foldSemanticsKeymap (codemirror/fold/foldSemanticsKeymap.ts) —
      // Clutter's own Ctrl-Shift-[/Ctrl-Shift-]/Ctrl-Alt-[/Ctrl-Alt-]
      // (fold/unfold/fold-all/unfold-all), replacing `@codemirror/language`'s
      // own `foldKeymap` entirely rather than sitting alongside it: the
      // native commands call `foldable()` directly, which can still fall
      // through to the generic, lazy-continuation-corrupted native answer
      // for a list/task item the moment `listItemFoldService`'s own
      // registered `foldService` declines — see that file's own doc
      // comment. `foldSemanticsKeymap`'s commands go through
      // `foldSemantics.ts`'s single authority instead, the same one
      // `foldToggleDecoration.ts` already used exclusively, so the toggle
      // and every keyboard fold command now agree by construction. Gated
      // on `enableFolding`, same as every other fold extension here — no
      // fold commands to bind when folding itself is disabled.
      //
      // foldAwareArrowKeymap (codemirror/fold/foldAwareArrowKeymap.ts) —
      // ahead of defaultKeymap for the same reason closeBracketsKeymap is:
      // it only overrides ArrowLeft/ArrowRight for the one case that
      // actually needs different behavior (the caret's next step would
      // land inside a folded range — skip over the fold instead of
      // @codemirror/language's own default auto-unfold-on-entry), and
      // explicitly declines (returns `false`) for every other keypress,
      // letting defaultKeymap's own cursorCharLeft/cursorCharRight handle
      // it completely unmodified. Same `enableFolding` gate as the other
      // fold extensions — nothing to skip over when there's no fold state.
      //
      // foldAwareMoveLineKeymap (codemirror/fold/foldAwareMoveLineKeymap.ts)
      // — same "override ahead of defaultKeymap, decline for every
      // non-fold-adjacent case" shape as foldAwareArrowKeymap, for
      // Alt-ArrowUp/Alt-ArrowDown (Option-Arrow on macOS) instead:
      // `@codemirror/commands`' own `moveLineUp`/`moveLineDown` swap the
      // current line with whichever physical line is adjacent, blind to
      // fold state, which corrupts (rather than relocates) a fold whose
      // hidden content sits on that adjacent line — see that file's own
      // doc comment for the confirmed transaction trace.
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...(enableHistory ? historyKeymap : []),
        ...(enableFolding ? foldSemanticsKeymap : []),
        ...(enableFolding ? foldAwareArrowKeymap : []),
        ...(enableFolding ? foldAwareMoveLineKeymap : []),
        ...editorDefaultKeymap,
      ]),
  ];

  // Opening a page should land the cursor at the end of its content, not
  // CM6's own default (position 0) — matches how a document is resumed,
  // not started. Only used on the fresh-state path: a restored state
  // brings its own serialized selection along (see docTextMatches below).
  const freshSelection = { anchor: doc.length };

  // The history VALUE is carried over as it is (not serialized): CodeMirror's history keeps each entry's effects
  // in memory, and its JSON form drops them, which would sever a template's metadata step from its undo entry.
  // The value is opaque here and only handed back to the same field it came from.
  let restoredState: EditorState | null = null;
  if (
    enableHistory &&
    restoreHistory?.history !== undefined &&
    (docTextMatches(restoreHistory, doc) ||
      restoreHistory.footprint !== undefined)
  ) {
    restoredState = EditorState.create({
      doc: restoreHistory.doc,
      selection: restoreHistory.selection,
      extensions: [
        ...allExtensions,
        historyField.init(() => restoreHistory.history),
        localHistoryFootprint.init(() => restoreHistory.footprint ?? [{ from: 0, to: restoreHistory.doc.length }]),
      ],
    }).update({ annotations: isolateHistory.of('full') }).state;
    // Reconcile the immutable cached state before constructing a view, through the exact live-sync path.
    // No onDocChange or metadata callback is fired, and the cache's original snapshot stays untouched.
    for (const transaction of externalSyncTransactions(restoredState, doc))
      restoredState = transaction.state;
  }

  const state =
    restoredState ??
    EditorState.create({
      doc,
      selection: freshSelection,
      extensions: allExtensions,
    });

  const view = new EditorView({
    state,
    parent,
    // Pixel scroll snapshots are valid only for identical text, even when history/selection can be mapped.
    scrollTo:
      restoredState && docTextMatches(restoreHistory, doc)
        ? restoreScrollEffect
        : undefined,
    // The one place every transaction passes through before it is applied — including undo and redo, which
    // CodeMirror's history creates with `filter: false` and so never reach a transaction filter. A refused
    // edit is dropped whole, so no state (document, history, selection) has to be repaired afterwards.
    dispatchTransactions: canEdit
      ? (transactions, editorView) => {
          const refused = transactions.some(
            (transaction) =>
              transaction.docChanged &&
              !transaction.annotation(externalSync) &&
              !canEdit()
          );

          if (!refused) {
            editorView.update(transactions);
          }
        }
      : undefined,
  });

  // ADR-033: fold restoration is independently gated from history/scroll
  // above — restoreFoldJSON comes from a different-lifetime source
  // (FoldStateStore, durable across restarts) than restoreHistory
  // (editorHistoryCache, session-lifetime only), so one being stale must
  // never suppress restoring the other. Applied as a dispatched effect
  // rather than folded into the fromJSON call above, for the same reason.
  if (restoreFoldJSON && docTextMatches(restoreFoldJSON, doc)) {
    const ranges = (restoreFoldJSON as { fold?: unknown }).fold;

    if (Array.isArray(ranges) && ranges.length % 2 === 0) {
      const effects: StateEffect<unknown>[] = [];
      for (let i = 0; i < ranges.length; i += 2) {
        const from = ranges[i];
        const to = ranges[i + 1];
        if (typeof from === 'number' && typeof to === 'number') {
          effects.push(foldEffect.of({ from, to }));
        }
      }

      if (effects.length > 0) {
        view.dispatch({ effects });
      }
    }
  }

  return view;
}

/**
 * Whether a cached snapshot's embedded `doc` (a plain string — the shape `EditorState.toJSON()` uses, which
 * the fold snapshot below still is, and which `EditorHistorySnapshot` mirrors) is the document now.
 * Original note on that shape: `EditorState.toJSON()`'s own `doc` field is a plain string
 * (`doc: this.sliceDoc()` — confirmed directly against the installed
 * `@codemirror/state` source; `EditorState.fromJSON` itself validates
 * `typeof json.doc === "string"` and throws otherwise). Not `Text`'s own,
 * different `toJSON()` shape (an array of lines) — the two are easy to
 * conflate but are not the same serialization, confirmed the hard way
 * (this function's first version assumed the array shape and always
 * returned `false`, so `restoreHistory` was silently ignored on
 * every call — caught by this module's own regression tests, not by
 * inspection).
 *
 * Exported (not module-private) so `MarkdownEditor.tsx` can apply the
 * exact same staleness check to its own DOM-level scroll-position
 * restoration (`editorHistoryCache.ts`'s `domScrollTop`) — a pixel scroll position cannot be reliably reused when the underlying document has changed externally, and duplicating
 * this one-line comparison there instead of importing it would risk the
 * two checks silently drifting apart.
 */
export function docTextMatches(serialized: unknown, doc: string): boolean {
  const json = serialized as { doc?: unknown } | null | undefined;
  return typeof json?.doc === 'string' && json.doc === doc;
}

/**
 * What the per-note cache (`editorHistoryCache.ts`) keeps of a closed editor: its undo/redo history, its
 * selection and the document they belong to. In memory only — never serialized.
 */
export interface EditorHistorySnapshot {
  readonly doc: string;
  readonly selection: EditorSelection;
  /** CodeMirror's `historyField` value, opaque: handed back to `historyField.init` on restore. */
  readonly history: unknown;
  /** Local conflict coordinates; older snapshots without these can only restore against identical text. */
  readonly footprint?: readonly HistoryRange[];
}

/**
 * Captures `view`'s undo/redo history, selection and document as a snapshot — the counterpart to
 * `restoreHistory` above. Intended for `editorHistoryCache.ts`: called right before a page's `EditorView` is
 * torn down (a page switch), stored keyed by that page's id, and handed back into a future
 * `createEditorView()` call's `restoreHistory` option when the user returns to that same page.
 *
 * The history is carried as the field's own value rather than through `EditorState.toJSON`, because the JSON
 * form of CodeMirror's history drops every entry's effects (see `metadataHistoryStep.ts`). Reading a field's
 * value (`state.field`) and starting a field from one (`StateField.init`) are documented `@codemirror/state`
 * API; that the value can move between states is not promised by `historyField`'s own doc comment (which
 * describes serialization), so `createEditorView.test.ts` pins the behaviour for the installed version.
 */
export function captureEditorHistory(view: EditorView): EditorHistorySnapshot {
  return {
    doc: view.state.doc.toString(),
    selection: view.state.selection,
    history: view.state.field(historyField, false),
    footprint: view.state.field(localHistoryFootprint, false),
  };
}

/**
 * Captures `view`'s current fold ranges (ADR-033) as a JSON-serializable
 * `{doc, fold}` snapshot — the counterpart to `restoreFoldJSON` above.
 * `foldState`'s own `StateField` spec already defines `toJSON`
 * (`node_modules/@codemirror/language`'s own source, confirmed directly),
 * producing the flat `[from, to, from, to, ...]` shape `restoreFoldJSON`
 * expects — no custom serialization needed, unlike `historyField`.
 * Intended for `application.foldStateStore.set(pageId, ...)`, called from
 * `MarkdownEditor.tsx`'s unmount cleanup alongside (but independently of)
 * `captureEditorHistory`.
 */
export function serializeFoldState(view: EditorView): {
  doc: string;
  fold: number[];
} {
  const json = view.state.toJSON({ fold: foldState }) as {
    doc: string;
    fold: number[];
  };
  return { doc: json.doc, fold: json.fold };
}

/**
 * Whether `view` shows real, prior engagement worth returning the user's
 * focus to — not merely "a cache entry for this page exists." A session
 * entry is written unconditionally on every unmount (see
 * `editorHistoryCache.ts`), including a page that was opened and closed
 * without the user ever touching it, and (in dev) React StrictMode's own
 * mount-unmount-remount cycle, which would otherwise manufacture a
 * trivially-matching "restorable session" (empty doc, selection at 0, no
 * history) out of a component lifecycle artifact rather than anything the
 * user did. Caught directly, not theorized: a brand-new, empty-title
 * draft's *second* StrictMode mount found `hasCachedSession: true` purely
 * from its own first mount's cleanup, which would have wrongly stolen
 * focus from the title on every brand-new note. A non-default caret
 * position or any undo history are both real, user-caused signals; a
 * doc-length caret from `EditorState.create`'s own default placement
 * (`createEditorView`'s own "cursor at document end, not 0" behavior —
 * see the test of that name) is deliberately excluded by checking against
 * `view.state.doc.length` too, not just `0`.
 */
export function hasEstablishedEditingPosition(view: EditorView): boolean {
  const { head } = view.state.selection.main;
  return (
    (head !== 0 && head !== view.state.doc.length) || undoDepth(view.state) > 0
  );
}

/**
 * Reconciles host content without an edit callback or a remote undo entry. Precise changes map unrelated local
 * history and selections; an overlapping local footprint or an imprecise bounded diff resets this note's
 * history through CM compartments. Both undo and redo are reset together, without replaying metadata effects.
 */
export function syncMarkdownIntoView(view: EditorView, markdown: string): void {
  const transactions = externalSyncTransactions(view.state, markdown);
  if (transactions.length) view.dispatch(transactions);
}
