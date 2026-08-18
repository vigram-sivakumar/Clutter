import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { editorTheme } from './editorTheme';

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
 * Constructs and mounts a CM6 `EditorView`. No Markdown language,
 * decorations, or semantic-token behavior — this is the plain-text CM6
 * foundation other modules build on incrementally.
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
    extensions: [updateListener, blurHandler, editorTheme(), ...extensions],
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
