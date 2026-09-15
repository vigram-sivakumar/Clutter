import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyField,
  historyKeymap,
  indentWithTab,
  undoDepth,
} from '@codemirror/commands';
import { codeFolding, foldEffect, foldState, indentUnit } from '@codemirror/language';
import {
  Annotation,
  EditorState,
  Transaction,
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

import { editorTheme } from './editorTheme';
import { foldAwareArrowKeymap } from './fold/foldAwareArrowKeymap';
import { foldAwareMoveLineKeymap } from './fold/foldAwareMoveLineKeymap';
import { foldSemanticsKeymap } from './fold/foldSemanticsKeymap';
import { foldToggleDecoration } from './fold/foldToggleDecoration';
import { indentedParagraphFoldService } from './fold/indentedParagraphFoldService';
import { listItemFoldService } from './fold/listItemFoldService';
import { INDENT_UNIT_STRING } from './indent/markdownIndentContext';
// `headingMarkerDecoration()` is wired for real now, via `MarkdownEditor.tsx`'s
// own extension list, not here. `markdownHighlighting()`/`markdownHighlightStyle`
// (the stale commented-out import that used to sit here) was retired
// outright — per docs/editor-architecture-decisions.md's "markdownHighlighting()
// retired" entry, every tag it mapped (heading1-6, emphasis, strong,
// strikethrough, highlight, monospace) already had a dedicated Live Preview
// decoration owner, making it a standing duplicate-ownership risk with no
// safe remaining purpose, not a harmless dormant extension.

/**
 * Marks a dispatched transaction as an external prop sync rather than user
 * input, so the update listener below can skip firing `onDocChange` for it
 * — mirrors the previous contentEditable implementation, where a direct
 * `textContent` assignment never fired a native `input` event either.
 */
const externalSync = Annotation.define<boolean>();

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
 * read-only awareness. No `externalSync` exemption: unlike the normal
 * editable editor, a note embed's `EditorView` is never reused across a
 * content change — `embedLivePreview.ts` rebuilds a fresh `NoteEmbedWidget`
 * (and therefore a fresh nested `EditorView`) whenever the resolved
 * markdown changes, so there is no "sync an existing read-only view"
 * scenario this needs to accommodate; keeping the check to exactly what
 * the actual consumer needs.
 */
const blockReadOnlyEdits = EditorState.transactionFilter.of((tr) =>
  tr.startState.readOnly && tr.docChanged ? [] : tr
);

export interface CreateEditorViewOptions {
  readonly doc: string;
  readonly parent: HTMLElement;
  readonly extensions?: readonly Extension[];
  readonly onDocChange?: (markdown: string) => void;
  readonly onBlur?: () => void;
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
   * A previous `serializeEditorHistory()` snapshot for this exact
   * document (typically retrieved from `editorHistoryCache.ts` by the
   * page id, right before this view is constructed for a page the user
   * is returning to) — when supplied *and* its own embedded document text
   * matches `doc`, the view's undo/redo history is restored from it
   * instead of starting fresh. Per docs/editor-architecture-decisions.md's
   * "Per-document CM6 undo/redo history preservation" entry: the doc-text
   * match check is load-bearing, not defensive boilerplate — a snapshot
   * whose embedded document no longer matches `doc` (something changed
   * the page's content between when this snapshot was taken and now,
   * e.g. a task toggled elsewhere while this page was closed) is exactly
   * as untrustworthy to restore from as it would be to show stale content
   * outright, so it's silently ignored and a fresh state is created
   * instead — never a partial/best-effort restore.
   */
  readonly restoreHistoryJSON?: unknown;
  /**
   * A previous `view.scrollSnapshot()` effect for this same page —
   * CM6's own documented mechanism for restoring scroll position
   * (`EditorViewConfig.scrollTo`: "Pass an effect created with...
   * `EditorView.scrollSnapshot` here to set an initial scroll
   * position"). Applied only when `restoreHistoryJSON` above was *also*
   * successfully restored (same doc-match gate) — scroll and history are
   * one session, restored together or not at all; a scroll position
   * captured against a document that's since changed elsewhere has
   * nothing meaningful to scroll to any more, and CM6's own doc comment
   * on `scrollSnapshot` warns exactly this case is silently unreliable
   * ("not an error, but may not scroll to the expected position") rather
   * than a case worth trying to partially honor.
   */
  readonly restoreScrollEffect?: StateEffect<unknown>;
  /**
   * A previous `serializeFoldState()` snapshot for this exact document
   * (ADR-033) — typically `application.foldStateStore.get(pageId)`,
   * retrieved right before this view is constructed. Validated with the
   * same `docTextMatches` gate `restoreHistoryJSON` uses, but applied
   * independently of it (a separate `view.dispatch` right after
   * construction, not merged into the same `EditorState.fromJSON` call):
   * `restoreHistoryJSON` comes from the session-lifetime
   * `editorHistoryCache` (reset every app restart) while this comes from
   * `FoldStateStore` (durable across restarts) — two sources with
   * genuinely different lifetimes and independent staleness outcomes, so
   * one being stale must never suppress restoring the other. See
   * ADR-033's Alternatives Considered for the full reasoning.
   */
  readonly restoreFoldJSON?: unknown;
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
    onBlur,
    restoreHistoryJSON,
    restoreScrollEffect,
    restoreFoldJSON,
    readOnly = false,
    enableFolding = !readOnly,
  } = options;

  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) {
      return;
    }

    const isExternalSync = update.transactions.some((tr) => tr.annotation(externalSync));
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
      ...readOnlyExtensions(readOnly),
      blockReadOnlyEdits,
      // Synchronizes CM6's own generic `indentUnit` facet to Clutter's
      // canonical indentation-unit constant (`INDENT_STEP_SPACES`,
      // `indent/markdownIndentContext.ts`) — the single point that keeps
      // every CM6-internal indentation-aware command (Backspace's
      // whitespace-only-prefix deletion via `deleteCharBackward`, Enter's
      // `insertNewlineAndIndent` fallback, `markdownEnterKeymap.ts`'s own
      // `exitEmptyIndentContinuation`, and `indentMore`/`indentLess`/
      // `indentSelection` — the last three reachable directly via
      // Cmd+]/Cmd+[/Cmd-Alt-\, unshadowed by `markdownIndentKeymap()`'s
      // own Tab/Shift-Tab bindings) agrees with Clutter's own Tab/
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
      EditorView.lineWrapping,
      history(),
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
        ? [codeFolding(), indentedParagraphFoldService(), listItemFoldService(), foldToggleDecoration()]
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
        ...historyKeymap,
        ...(enableFolding ? foldSemanticsKeymap : []),
        ...(enableFolding ? foldAwareArrowKeymap : []),
        ...(enableFolding ? foldAwareMoveLineKeymap : []),
        ...defaultKeymap,
      ]),
  ];

  // Opening a page should land the cursor at the end of its content, not
  // CM6's own default (position 0) — matches how a document is resumed,
  // not started. Only used on the fresh-state path: a restored state
  // brings its own serialized selection along (see docTextMatches below).
  const freshSelection = { anchor: doc.length };

  const restoredState =
    restoreHistoryJSON && docTextMatches(restoreHistoryJSON, doc)
      ? EditorState.fromJSON(
          restoreHistoryJSON,
          { extensions: allExtensions },
          { history: historyField }
        )
      : null;

  const state =
    restoredState ??
    EditorState.create({ doc, selection: freshSelection, extensions: allExtensions });

  const view = new EditorView({
    state,
    parent,
    // Gated on `restoredState` (not merely on `restoreScrollEffect` being
    // present) — a scroll target captured against a document that turned
    // out to be stale (docTextMatches failed above) has nothing valid to
    // scroll to; restoring it anyway would be exactly the kind of
    // partial/best-effort restore this whole mechanism is designed to
    // avoid (see `restoreScrollEffect`'s own doc comment).
    scrollTo: restoredState ? restoreScrollEffect : undefined,
  });

  // ADR-033: fold restoration is independently gated from history/scroll
  // above — restoreFoldJSON comes from a different-lifetime source
  // (FoldStateStore, durable across restarts) than restoreHistoryJSON
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
 * `EditorState.toJSON()`'s own `doc` field is a plain string
 * (`doc: this.sliceDoc()` — confirmed directly against the installed
 * `@codemirror/state` source; `EditorState.fromJSON` itself validates
 * `typeof json.doc === "string"` and throws otherwise). Not `Text`'s own,
 * different `toJSON()` shape (an array of lines) — the two are easy to
 * conflate but are not the same serialization, confirmed the hard way
 * (this function's first version assumed the array shape and always
 * returned `false`, so `restoreHistoryJSON` was silently ignored on
 * every call — caught by this module's own regression tests, not by
 * inspection).
 *
 * Exported (not module-private) so `MarkdownEditor.tsx` can apply the
 * exact same staleness check to its own DOM-level scroll-position
 * restoration (`editorHistoryCache.ts`'s `domScrollTop`) — a session's
 * scroll position is exactly as untrustworthy to restore as its history
 * is when the underlying document has changed externally, and duplicating
 * this one-line comparison there instead of importing it would risk the
 * two checks silently drifting apart.
 */
export function docTextMatches(serialized: unknown, doc: string): boolean {
  const json = serialized as { doc?: unknown } | null | undefined;
  return typeof json?.doc === 'string' && json.doc === doc;
}

/**
 * Captures `view`'s full undo/redo history (plus its current document and
 * selection, both already part of every `EditorState`) as a
 * JSON-serializable snapshot — the counterpart to `restoreHistoryJSON`
 * above. Intended for `editorHistoryCache.ts`: called right before a
 * page's `EditorView` is torn down (a page switch), stored keyed by that
 * page's id, and handed back into a future `createEditorView()` call's
 * `restoreHistoryJSON` option when the user returns to that same page.
 * `{history: historyField}` is CM6's own documented mechanism for this —
 * `historyField`'s own doc comment: "Should probably only be used when
 * you want to serialize or deserialize state objects in a way that
 * preserves history" — confirmed end-to-end (including zero cross-
 * document leakage between two unrelated documents' snapshots) before
 * this was wired in; see the architecture-decisions.md entry for the
 * verification.
 */
export function serializeEditorHistory(view: EditorView): unknown {
  return view.state.toJSON({ history: historyField });
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
 * `serializeEditorHistory`.
 */
export function serializeFoldState(view: EditorView): { doc: string; fold: number[] } {
  const json = view.state.toJSON({ fold: foldState }) as { doc: string; fold: number[] };
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
  return (head !== 0 && head !== view.state.doc.length) || undoDepth(view.state) > 0;
}

/**
 * The smallest single `{from, to, insert}` change that turns `current` into
 * `next` — a common-prefix/common-suffix diff, not a general (multi-hunk)
 * diff algorithm. That's deliberate, not a simplification taken for
 * expedience: `syncMarkdownIntoView`'s callers (task-checkbox toggles from
 * a different UI surface, any other single-`PageOperations.mutateBody()`-
 * style external mutation) each make one small, localized edit to an
 * otherwise-unchanged document, which a prefix/suffix diff finds exactly
 * and cheaply (no dependency, no O(n²)/Myers-diff cost). Its job here is
 * narrower than "compute a good diff" — it's "touch as little of the
 * document's position-space as possible," so that CM6's history mapping
 * (see `syncMarkdownIntoView`'s own doc comment) has the best chance of
 * keeping an *unrelated* prior user edit's undo entry intact. A full
 * `{from: 0, to: current.length, insert: next}` replace (the previous
 * behavior) touches the *entire* document's position-space on every sync,
 * regardless of how small the actual external change was — proven to be
 * more damage than the mapping can reliably recover from (see the doc
 * comment below).
 */
function minimalReplaceChange(
  current: string,
  next: string
): { from: number; to: number; insert: string } {
  const maxCommon = Math.min(current.length, next.length);
  let prefix = 0;
  while (prefix < maxCommon && current[prefix] === next[prefix]) {
    prefix++;
  }
  let suffix = 0;
  const maxSuffix = maxCommon - prefix;
  while (
    suffix < maxSuffix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }
  return {
    from: prefix,
    to: current.length - suffix,
    insert: next.slice(prefix, next.length - suffix),
  };
}

/**
 * Replaces the view's document with `markdown` to match an external change
 * — the page's content changed somewhere other than this same editor
 * instance (`PageOperations.mutateBody()`, e.g. a task-checkbox toggle from
 * a different UI surface acting on the same open-but-unfocused page; see
 * `MarkdownEditor.tsx`'s own call site for the focus-gating this always
 * runs under). Tagged `externalSync` so the update listener above skips
 * `onDocChange` for it (prevents a feedback loop back into the very state
 * this sync is reconciling from) — completely independent of, and
 * unaffected by, the history annotation below; that annotation governs
 * whether the change is *undo-able*, this one governs whether it *re-fires
 * the edit callback*, and a transaction can need only one, the other, or
 * (here) both.
 *
 * **Also tagged `Transaction.addToHistory.of(false)` (2026-08-27) — this
 * transaction must never become a user-undoable step.** Confirmed as a
 * real bug, not a theoretical one, via a direct `createEditorView()` +
 * `syncMarkdownIntoView()` + CM6's own `undo`/`undoDepth` commands
 * reproduction (no UI needed — this is a CM6 history-mechanics question,
 * not a rendering one): dispatching this transaction *without* the
 * annotation, immediately after one real user edit, did not create a
 * *second* undo-able step as expected — CM6's default history grouping
 * silently merged it into the *same* group as the preceding user edit
 * (confirmed: `undoDepth` stayed at `1`, not `2`), so a single subsequent
 * `undo()` reverted the user's own edit *and* the unrelated external
 * change together, in one step the user never asked for.
 *
 * `Transaction.addToHistory.of(false)` alone is not sufficient, and this
 * is why the diff above is minimal rather than a full-document replace:
 * excluding a transaction from history does not exempt it from CM6's
 * change-mapping — a still-open undo entry from *before* this transaction
 * has its recorded positions mapped through it regardless, and a full
 * `{from: 0, to: current.length}` replace maps every prior position
 * through "the entire document was deleted and something new inserted,"
 * which degenerates the mapped entry into an empty/meaningless change —
 * confirmed directly: with `addToHistory: false` alone (full-document
 * replace), `undoDepth` dropped to `0` immediately after the sync, losing
 * the user's own still-unsaved edit from history entirely, with no way to
 * undo it. The minimal diff instead maps a prior edit's positions through
 * only the small, localized change that's actually different, which
 * `ChangeSet.map` can carry through intact when (as expected for this
 * call site's actual callers) the two edits don't overlap — confirmed
 * directly: `undoDepth` stays at `1` through this sync, `undo()` correctly
 * reverts only the user's own edit (leaving the externally-synced content
 * in place), and `redo()` correctly restores it afterward.
 *
 * No-ops if the view's document already matches (same as before this
 * fix) — this is the common case (the `markdown` prop round-tripping this
 * same editor's own just-committed edit back through React state), so the
 * cost of this function is usually just one string comparison.
 */
export function syncMarkdownIntoView(view: EditorView, markdown: string): void {
  const currentDoc = view.state.doc.toString();
  if (currentDoc === markdown) {
    return;
  }

  view.dispatch({
    changes: minimalReplaceChange(currentDoc, markdown),
    annotations: [externalSync.of(true), Transaction.addToHistory.of(false)],
  });
}
