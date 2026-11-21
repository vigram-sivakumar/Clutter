import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { keymap, ViewPlugin, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

interface EmbedObjectSelection {
  readonly from: number;
  readonly to: number;
}

const embedObjectSelectionChanged = StateEffect.define<EmbedObjectSelection | null>();

export const embedObjectSelectionField = StateField.define<EmbedObjectSelection | null>({
  create: () => null,
  update(selection, transaction) {
    let next = transaction.docChanged || transaction.selectionSet ? null : selection;
    for (const effect of transaction.effects) {
      if (effect.is(embedObjectSelectionChanged)) next = effect.value;
    }
    return next;
  },
});

/** Select a rendered ![[...]] object without placing a caret in its hidden source. */
export function selectEmbedObject(view: EditorView, from: number, to: number): void {
  if (view.state.readOnly) return;
  view.dispatch({ effects: embedObjectSelectionChanged.of({ from, to }) });
  view.focus();
  syncEmbedObjectSelection(view);
}

function findRenderedEmbed(view: EditorView, from: number): EmbedObjectSelection | null {
  let result: EmbedObjectSelection | null = null;
  syntaxTree(view.state).iterate({
    from,
    to: Math.min(view.state.doc.length, from + 1),
    enter(node) {
      if (node.name === 'Embed' && node.from === from) result = { from: node.from, to: node.to };
    },
  });
  if (!result) return null;
  const marker = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-embed-from]')).find(
    (element) =>
      element.closest('.cm-editor') === view.dom && Number(element.dataset.embedFrom) === from
  );
  return marker ? result : null;
}

function findRenderedEmbedOnLine(view: EditorView, lineNumber: number): EmbedObjectSelection | null {
  if (lineNumber < 1 || lineNumber > view.state.doc.lines) return null;
  const line = view.state.doc.line(lineNumber);
  let candidate: EmbedObjectSelection | null = null;
  syntaxTree(view.state).iterate({
    from: line.from,
    to: Math.min(view.state.doc.length, line.to + 1),
    enter(node) {
      if (node.name === 'Embed' && node.from >= line.from && node.from <= line.to) {
        candidate = findRenderedEmbed(view, node.from);
      }
    },
  });
  return candidate;
}

function adjacentEditablePosition(view: EditorView, selection: EmbedObjectSelection, direction: 'before' | 'after'): number {
  const { doc } = view.state;
  if (direction === 'before') {
    return selection.from > 0 && doc.sliceString(selection.from - 1, selection.from) === '\n'
      ? selection.from - 1
      : selection.from;
  }
  if (selection.to < doc.length && doc.sliceString(selection.to, selection.to + 1) === '\n') {
    return selection.to + 1;
  }
  return selection.to;
}

export function embedObjectSelectionKeymap(): Extension {
  const moveOutOfSelection = (direction: 'before' | 'after'): Command => (view) => {
    const selected = view.state.field(embedObjectSelectionField, false) ?? null;
    if (!selected) return false;
    const hasFollowingNewline =
      selected.to < view.state.doc.length &&
      view.state.doc.sliceString(selected.to, selected.to + 1) === '\n';
    if (direction === 'before' && selected.from === 0) return true;
    if (direction === 'after' && !hasFollowingNewline && selected.to === view.state.doc.length) {
      view.dispatch({
        changes: { from: selected.to, insert: '\n' },
        selection: EditorSelection.cursor(selected.to + 1),
        scrollIntoView: true,
      });
      view.focus();
      syncEmbedObjectSelection(view);
      return true;
    }
    const position = adjacentEditablePosition(view, selected, direction);
    view.dispatch({
      effects: embedObjectSelectionChanged.of(null),
      selection: EditorSelection.cursor(position),
      scrollIntoView: true,
    });
    syncEmbedObjectSelection(view);
    return true;
  };

  const createLineBelowSelection: Command = (view) => {
    const selected = view.state.field(embedObjectSelectionField, false) ?? null;
    if (!selected || view.state.readOnly) return false;
    const insert = '\n';
    const cursor = selected.to + 1;
    view.dispatch({
      changes: { from: selected.to, insert },
      selection: EditorSelection.cursor(cursor),
      scrollIntoView: true,
    });
    view.focus();
    syncEmbedObjectSelection(view);
    return true;
  };

  const selectAdjacentEmbed = (direction: 'left' | 'right'): Command => (view) => {
    if (view.state.readOnly) return false;
    const selected = view.state.field(embedObjectSelectionField, false) ?? null;
    if (selected) return moveOutOfSelection(direction === 'left' ? 'before' : 'after')(view);

    const position = view.state.selection.main.head;
    if (!view.state.selection.main.empty) return false;
    const candidates: EmbedObjectSelection[] = [];
    syntaxTree(view.state).iterate({
      from: Math.max(0, position - 1),
      to: Math.min(view.state.doc.length, position + 1),
      enter(node) {
        if (node.name !== 'Embed') return;
        const atBoundary = direction === 'right' ? node.from === position : node.to === position;
        if (atBoundary && findRenderedEmbed(view, node.from)) {
          candidates.push({ from: node.from, to: node.to });
        }
      },
    });
    if (!candidates[0]) return false;
    selectEmbedObject(view, candidates[0].from, candidates[0].to);
    return true;
  };

  // Vertical navigation is based on document lines, not a guessed screen
  // coordinate. A rendered embed occupies its source line as one block.
  const selectVerticallyAdjacentEmbed = (direction: 'up' | 'down'): Command => (view) => {
    if (view.state.readOnly) return false;
    const selected = view.state.field(embedObjectSelectionField, false) ?? null;
    const currentLineNumber = selected
      ? view.state.doc.lineAt(selected.from).number
      : view.state.doc.lineAt(view.state.selection.main.head).number;
    if (!selected && !view.state.selection.main.empty) return false;

    const targetLineNumber = currentLineNumber + (direction === 'down' ? 1 : -1);
    const adjacentEmbed = findRenderedEmbedOnLine(view, targetLineNumber);
    if (adjacentEmbed) {
      selectEmbedObject(view, adjacentEmbed.from, adjacentEmbed.to);
      return true;
    }
    if (selected) return moveOutOfSelection(direction === 'up' ? 'before' : 'after')(view);
    return false;
  };

  const clearSelection: Command = (view) => {
    const selected = view.state.field(embedObjectSelectionField, false) ?? null;
    if (!selected) return false;
    view.dispatch({ effects: embedObjectSelectionChanged.of(null) });
    syncEmbedObjectSelection(view);
    return true;
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'ArrowLeft', run: selectAdjacentEmbed('left') },
    { key: 'ArrowRight', run: selectAdjacentEmbed('right') },
    { key: 'ArrowUp', run: selectVerticallyAdjacentEmbed('up') },
    { key: 'ArrowDown', run: selectVerticallyAdjacentEmbed('down') },
    { key: 'Enter', run: createLineBelowSelection },
    { key: 'Escape', run: clearSelection },
  ];

  const lifecycle = ViewPlugin.fromClass(
    class {
      private readonly onPointerDown = (event: PointerEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        // A nested note editor is a separate interaction surface.
        if (
          !view.dom.contains(target) ||
          (target instanceof Element && target.closest('.cm-editor') !== view.dom)
        ) {
          this.clear();
        }
      };

      private readonly onFocusOut = (event: FocusEvent) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !view.dom.contains(nextTarget)) this.clear();
      };

      private readonly onWindowBlur = () => this.clear();

      constructor(private readonly view: EditorView) {
        view.dom.ownerDocument.addEventListener('pointerdown', this.onPointerDown, true);
        view.dom.addEventListener('focusout', this.onFocusOut);
        view.dom.ownerDocument.defaultView?.addEventListener('blur', this.onWindowBlur);
      }

      private clear(): void {
        if (!this.view.state.field(embedObjectSelectionField, false)) return;
        this.view.dispatch({ effects: embedObjectSelectionChanged.of(null) });
        syncEmbedObjectSelection(this.view);
      }

      destroy(): void {
        this.view.dom.ownerDocument.removeEventListener('pointerdown', this.onPointerDown, true);
        this.view.dom.removeEventListener('focusout', this.onFocusOut);
        this.view.dom.ownerDocument.defaultView?.removeEventListener('blur', this.onWindowBlur);
      }
    }
  );

  return Prec.highest([keymap.of(bindings), lifecycle]);
}

/** Apply the active state to the already-rendered widget DOM. */
export function syncEmbedObjectSelection(view: EditorView): void {
  const selected = view.state.field(embedObjectSelectionField, false) ?? null;
  for (const widget of view.dom.querySelectorAll<HTMLElement>('[data-embed-from]')) {
    if (widget.closest('.cm-editor') !== view.dom) continue;
    widget.classList.toggle(
      'cm-embed-object-selected',
      selected !== null && Number(widget.dataset.embedFrom) === selected.from
    );
  }
}
