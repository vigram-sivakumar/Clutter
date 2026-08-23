import { defaultKeymap } from '@codemirror/commands';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view';

import { editorTheme } from './editorTheme';
// TEMPORARILY DISABLED — Live Preview rendering, unwired for the
// keyboard-behavior-only editor configuration (see MarkdownEditor.tsx).
// headingMarkerDecoration() is purely visual (hide/reveal via
// liveMarkDecoration, no keymap/atomicRanges/transactionFilter of its
// own); markdownHighlighting() is the syntax-highlighting HighlightStyle
// (CSS classes only, no DOM restructuring, but still visual styling).
// Neither deleted nor rewritten — uncomment both to restore.
// import { headingMarkerDecoration } from './highlight/headingMarkerDecoration';
// import { markdownHighlighting } from './highlight/markdownHighlightStyle';

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
 * modules build on incrementally. `markdownHighlighting()` and
 * `highlightActiveLine()` are the exceptions, wired here rather than
 * left to each caller's own extension list, matching `editorTheme()`'s
 * precedent: all three are baseline visual wiring applicable regardless
 * of which Markdown grammar extensions (`markdownLanguageExtension()` et
 * al.) a caller passes in via `extensions`, not feature behavior of
 * their own. `highlightActiveLine()` is CM6's own built-in extension
 * (`@codemirror/view`) — it only adds a `cm-activeLine` class for the
 * active-line background highlight (`editorTheme.ts`); heading Live
 * Preview hide/reveal no longer depends on it (`headingMarkerDecoration()`
 * uses selection-containment engagement instead, matching every other
 * Markdown construct — see `highlight/liveMarkDecoration.ts`'s doc
 * comment for why line-granularity CSS hiding was replaced).
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
      // construct the way markdownHighlighting()/headingMarkerDecoration()
      // do, and disabling them would just make the editor hard to see.
      editorTheme(),
      // markdownHighlighting(),
      // headingMarkerDecoration(),
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
      ...extensions,
      // Lowest-priority keymap (added last), so any higher-precedence
      // binding in `extensions` above still wins when it applies. Without
      // this, Enter had no CM6-level binding at all and fell through to
      // the browser's native contentEditable paragraph-split behavior,
      // which CM6 then had to reconcile via DOM-mutation observation — the
      // actual source of the double-newline and stuck-until-refocus
      // symptoms, not a CSS or focus-handling issue.
      keymap.of(defaultKeymap),
    ],
  });

  return new EditorView({ state, parent });
}

/**
 * Replaces the view's full document with `markdown`, tagged so the update
 * listener above treats it as a prop-driven sync rather than user input.
 * No-ops if the view's document already matches.
 */
export function syncMarkdownIntoView(view: EditorView, markdown: string): void {
  const currentDoc = view.state.doc.toString();
  if (currentDoc === markdown) {
    return;
  }

  view.dispatch({
    changes: { from: 0, to: currentDoc.length, insert: markdown },
    annotations: externalSync.of(true),
  });
}
