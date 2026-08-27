import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { codeFolding, foldGutter, foldKeymap } from '@codemirror/language';
import { Annotation, EditorState, Transaction, type Extension } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
} from '@codemirror/view';

import { editorTheme } from './editorTheme';
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

export interface CreateEditorViewOptions {
  readonly doc: string;
  readonly parent: HTMLElement;
  readonly extensions?: readonly Extension[];
  readonly onDocChange?: (markdown: string) => void;
  readonly onBlur?: () => void;
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
  const { doc, parent, extensions = [], onDocChange, onBlur } = options;

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

  const state = EditorState.create({
    doc,
    // Opening a page should land the cursor at the end of its content, not
    // CM6's own default (position 0) — matches how a document is resumed,
    // not started. Set once at initial-state construction, so it's just
    // this view's starting selection: any later click/selection dispatches
    // through the normal transaction path untouched.
    selection: { anchor: doc.length },
    extensions: [
      updateListener,
      blurHandler,
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
      // codeFolding() is the fold state/commands; foldGutter() is CM6's
      // own standard gutter UI for it — the first gutter this editor has.
      // Both consume exactly the foldNodeProp data markdownLanguageExtension()
      // already gets for free from @codemirror/lang-markdown (headings,
      // fenced code blocks, blockquotes, tables); no Clutter-authored fold
      // detection or gutter rendering.
      codeFolding(),
      foldGutter(),
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
      // Backspace press exactly as before. foldKeymap adds
      // Ctrl-Shift-[/Ctrl-Shift-] (fold/unfold), which nothing else binds.
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...defaultKeymap,
      ]),
    ],
  });

  return new EditorView({ state, parent });
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
