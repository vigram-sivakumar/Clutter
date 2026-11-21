import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { keymap, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

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
      if (effect.is(embedObjectSelectionChanged)) {
        next = effect.value;
      }
    }
    return next;
  },
});

/**
 * Treats a rendered resource/note embed as one keyboard-selectable object.
 * The widget DOM advertises its source position with data-embed-from; that
 * marker is only present for rendered ![[...]] embeds, never standard
 * Markdown images or source-revealed embeds.
 */
export function embedObjectSelectionKeymap(): Extension {
  const moveOutOfSelection = (direction: 'before' | 'after'): Command => (view) => {
    const selection = view.state.field(embedObjectSelectionField, false) ?? null;
    if (!selection) return false;

    view.dispatch({
      effects: embedObjectSelectionChanged.of(null),
      selection: EditorSelection.cursor(direction === 'before' ? selection.from : selection.to),
      scrollIntoView: true,
    });
    syncEmbedObjectSelection(view);
    return true;
  };

  const selectAdjacentEmbed = (direction: 'left' | 'right'): Command => (view) => {
    if (view.state.readOnly) return false;
    const current = view.state.field(embedObjectSelectionField, false) ?? null;
    if (current) {
      return moveOutOfSelection(direction === 'left' ? 'before' : 'after')(view);
    }

    const main = view.state.selection.main;
    if (!main.empty) return false;
    const position = main.head;
    const candidates: EmbedObjectSelection[] = [];

    syntaxTree(view.state).iterate({
      from: Math.max(0, position - 1),
      to: Math.min(view.state.doc.length, position + 1),
      enter(node) {
        if (node.name !== 'Embed') return;
        const matchesBoundary = direction === 'right' ? node.from === position : node.to === position;
        if (!matchesBoundary) return;

        // The marker exists only on a live rendered widget. This avoids
        // intercepting navigation for incomplete, first-leave-pending, or
        // explicitly source-revealed Markdown.
        const widget = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-embed-from]')).find(
          (element) =>
            element.closest('.cm-editor') === view.dom && Number(element.dataset.embedFrom) === node.from
        );
        if (widget) candidates.push({ from: node.from, to: node.to });
      },
    });

    const candidate = candidates[0];
    if (!candidate) return false;
    view.dispatch({ effects: embedObjectSelectionChanged.of(candidate) });
    syncEmbedObjectSelection(view);
    return true;
  };

  const selectVerticallyAdjacentEmbed = (direction: 'up' | 'down'): Command => (view) => {
    if (view.state.readOnly) return false;

    const current = view.state.field(embedObjectSelectionField, false) ?? null;
    if (current) {
      return moveOutOfSelection(direction === 'up' ? 'before' : 'after')(view);
    }

    const main = view.state.selection.main;
    if (!main.empty) return false;

    const cursor = view.coordsAtPos(main.head);
    if (!cursor) return false;

    // Probe the adjacent visual line. If it intersects a rendered embed
    // widget, vertical navigation is entering that block and should select
    // the whole object rather than leave a caret at its source boundary.
    const targetY =
      direction === 'down'
        ? cursor.bottom + view.defaultLineHeight / 2
        : cursor.top - view.defaultLineHeight / 2;

    for (const widget of view.dom.querySelectorAll<HTMLElement>('[data-embed-from]')) {
      if (widget.closest('.cm-editor') !== view.dom) continue;

      const rect = widget.getBoundingClientRect();
      if (targetY < rect.top || targetY > rect.bottom) continue;

      const from = Number(widget.dataset.embedFrom);
      if (!Number.isInteger(from)) continue;

      let candidate: EmbedObjectSelection | null = null;
      syntaxTree(view.state).iterate({
        from,
        to: Math.min(view.state.doc.length, from + 1),
        enter(node) {
          if (node.name === 'Embed' && node.from === from) {
            candidate = { from: node.from, to: node.to };
          }
        },
      });

      if (!candidate) continue;
      view.dispatch({ effects: embedObjectSelectionChanged.of(candidate) });
      syncEmbedObjectSelection(view);
      return true;
    }

    return false;
  };

  const clearSelection: Command = (view) => {
    if (!(view.state.field(embedObjectSelectionField, false) ?? null)) return false;
    view.dispatch({ effects: embedObjectSelectionChanged.of(null) });
    syncEmbedObjectSelection(view);
    return true;
  };

  const bindings: readonly KeyBinding[] = [
    { key: 'ArrowLeft', run: selectAdjacentEmbed('left') },
    { key: 'ArrowRight', run: selectAdjacentEmbed('right') },
    { key: 'ArrowUp', run: selectVerticallyAdjacentEmbed('up') },
    { key: 'ArrowDown', run: selectVerticallyAdjacentEmbed('down') },
    { key: 'Enter', run: moveOutOfSelection('after') },
    { key: 'Escape', run: clearSelection },
  ];

  return Prec.highest(keymap.of(bindings));
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
