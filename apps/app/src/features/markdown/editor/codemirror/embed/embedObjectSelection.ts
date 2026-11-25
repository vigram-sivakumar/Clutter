import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Prec, StateEffect, StateField, type Extension } from '@codemirror/state';

import { EditorView, keymap, ViewPlugin, type Command, type KeyBinding } from '@codemirror/view';

import { isStandaloneEmbedLine } from './embedBlockLine';

export interface EmbedObjectRange {
  readonly from: number;
  readonly to: number;
}

interface EmbedObjectSelection extends EmbedObjectRange {
  /** A batch can contain separate embeds, even with intervening rich-paste text. */
  readonly members?: readonly EmbedObjectRange[];
}

const embedObjectSelectionChanged = StateEffect.define<EmbedObjectSelection | null>();

/** Post-change coordinates, included in the insertion transaction. */
export function selectInsertedEmbeds(ranges: readonly EmbedObjectRange[]) {
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  return embedObjectSelectionChanged.of(first && last
    ? { from: first.from, to: last.to, ...(ranges.length > 1 && { members: ranges }) }
    : null);
}

export const embedObjectSelectionField = StateField.define<EmbedObjectSelection | null>({
  create: () => null,
  update(selection, transaction) {
    let next = transaction.docChanged || transaction.selection !== undefined ? null : selection;
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

/** Protect both sides of a rendered block, including its continuation indentation. */
function selectEmbedAtDeletionBoundary(direction: 'backspace' | 'delete'): Command {
  return (view) => {
    if (view.state.readOnly || view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty) return false;
    const position = view.state.selection.main.head;
    const line = view.state.doc.lineAt(position);
    const standaloneOn = (number: number) => {
      const embed = findRenderedEmbedOnLine(view, number);
      return embed && isStandaloneEmbedLine(view.state, embed) ? embed : null;
    };
    const current = standaloneOn(line.number);
    let target = current && (direction === 'backspace' ? position <= current.from : position >= current.to)
      ? current : null;
    if (!target && direction === 'backspace' && position === line.from) target = standaloneOn(line.number - 1);
    if (!target && direction === 'delete' && position === line.to) target = standaloneOn(line.number + 1);
    if (!target) return false;
    selectEmbedObject(view, target.from, target.to);
    return true;
  };
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

  const createLineBelowSelectedEmbed: Command = (view) => {
    const selected = view.state.field(embedObjectSelectionField, false) ?? null;
    if (!selected || view.state.readOnly) return false;

    // Enter always creates a fresh editable line directly below the embed.
    // If another line already follows, preserve it and insert a blank line
    // between the embed and that content.
    view.dispatch({
      changes: { from: selected.to, insert: '\n' },
      effects: embedObjectSelectionChanged.of(null),
      selection: EditorSelection.cursor(selected.to + 1),
      scrollIntoView: true,
      userEvent: 'input',
    });
    view.focus();
    syncEmbedObjectSelection(view);
    return true;
  };

  const removeSelectedEmbed: Command = (view) => {
    const selected = view.state.field(embedObjectSelectionField, false) ?? null;
    if (!selected || view.state.readOnly) return false;
    view.dispatch({
      changes: selected.members && selected.members.some((member, index, members) => index > 0 && /\S/.test(view.state.sliceDoc(members[index - 1]!.to, member.from)))
        ? selected.members.map(({ from, to }) => ({ from, to, insert: '' }))
        : { from: selected.from, to: selected.to, insert: '' },
      selection: EditorSelection.cursor(selected.from),
      scrollIntoView: true,
    });
    view.focus();
    syncEmbedObjectSelection(view);
    return true;
  };

  const deleteOrSelectEmbed = (direction: 'backspace' | 'delete'): Command => (view) => {
    if (view.state.field(embedObjectSelectionField, false)) return removeSelectedEmbed(view);
    return selectEmbedAtDeletionBoundary(direction)(view);
  };

  const ignoreShiftEnterOnSelectedEmbed: Command = (view) => {
    return view.state.field(embedObjectSelectionField, false) !== null;
  };

  const selectAdjacentEmbed = (direction: 'left' | 'right'): Command => (view) => {
    if (view.state.readOnly) return false;
    const selected = view.state.field(embedObjectSelectionField, false) ?? null;
    if (selected) return moveOutOfSelection(direction === 'left' ? 'before' : 'after')(view);

    const position = view.state.selection.main.head;
    if (!view.state.selection.main.empty) return false;
    const { doc } = view.state;
    const crossesLineBoundary =
      direction === 'right'
        ? position < doc.length && doc.sliceString(position, position + 1) === '\n'
        : position > 0 && doc.sliceString(position - 1, position) === '\n';
    const candidates: EmbedObjectSelection[] = [];
    syntaxTree(view.state).iterate({
      from: Math.max(0, position - 1),
      to: Math.min(doc.length, position + 2),
      enter(node) {
        if (node.name !== 'Embed') return;
        const atBoundary =
          direction === 'right'
            ? node.from === position || (crossesLineBoundary && node.from === position + 1)
            : node.to === position || (crossesLineBoundary && node.to === position - 1);
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
      ? view.state.doc.lineAt(direction === 'down' ? selected.to : selected.from).number
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
    { key: 'Backspace', run: deleteOrSelectEmbed('backspace') },
    { key: 'Delete', run: deleteOrSelectEmbed('delete') },
    { key: 'ArrowLeft', run: selectAdjacentEmbed('left') },
    { key: 'ArrowRight', run: selectAdjacentEmbed('right') },
    { key: 'ArrowUp', run: selectVerticallyAdjacentEmbed('up') },
    { key: 'ArrowDown', run: selectVerticallyAdjacentEmbed('down') },
    { key: 'Shift-Enter', run: ignoreShiftEnterOnSelectedEmbed },
    { key: 'Enter', run: createLineBelowSelectedEmbed },
    { key: 'Escape', run: clearSelection },
  ];

  const lifecycle = ViewPlugin.fromClass(
    class {
      // Any new pointer interaction ends the previous object selection.
      // If the click lands on another embed, that widget's click handler
      // selects it again after this capture-phase clear.
      private readonly onPointerDown = () => {
        this.clear();
      };

      private readonly onFocusOut = (event: FocusEvent) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !this.view.dom.contains(nextTarget)) this.clear();
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

  const selectionTheme = EditorView.theme({
    // Hide the entire cursor layer, not only the caret element. CM6 can
    // keep the cursor layer's line-box visible at the end of a block widget,
    // which looks like a caret wrapped underneath the embed even when the
    // inner cursor itself is hidden.
    '&.cm-embed-object-selection-active .cm-cursorLayer': {
      visibility: 'hidden !important',
    },
  });

  return Prec.highest([selectionTheme, keymap.of(bindings), lifecycle]);
}

/** Apply the active state to the already-rendered widget DOM. */
export function syncEmbedObjectSelection(view: EditorView): void {
  const selected = view.state.field(embedObjectSelectionField, false) ?? null;
  // Keep CodeMirror focused for keyboard navigation, but never show its
  // text caret while focus is represented by a selected embed object.
  view.dom.classList.toggle('cm-embed-object-selection-active', selected !== null);
  for (const widget of view.dom.querySelectorAll<HTMLElement>('[data-embed-from]')) {
    if (widget.closest('.cm-editor') !== view.dom) continue;
    widget.classList.toggle(
      'cm-embed-object-selected',
      selected !== null && (selected.members ?? [selected]).some((member) => Number(widget.dataset.embedFrom) === member.from)
    );
  }
}
