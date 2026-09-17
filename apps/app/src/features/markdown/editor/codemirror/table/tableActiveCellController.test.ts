// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

/** Includes `history()` — root CM6 owns undo/redo (§A); the nested editor never does (`enableHistory: false`). */
function mountRootView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), history()] }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

describe('TableActiveCellController — click-activate', () => {
  it('mounts a nested editor into the container, with the cell\'s own text and caret placed at the clicked position', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 10, 8); // "bold", caret after "bo"

    expect(controller.nestedView).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('bold');
    expect(controller.nestedView!.state.selection.main.head).toBe(2);
    expect(container.contains(controller.nestedView!.dom)).toBe(true);
  });

  it('re-resolves the cell range fresh at activation time, not from a stale earlier capture (ADR-034: stale click-handler closures)', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    // Shift every later position by inserting text at the very start.
    root.dispatch({ changes: { from: 0, to: 0, insert: 'XX' } });
    const shiftedFrom = 6 + 2;
    const shiftedTo = 7 + 2;

    controller.activate(root, container, shiftedFrom, shiftedTo, shiftedFrom);

    expect(controller.nestedView!.state.doc.toString()).toBe('b');
  });
});

describe('TableActiveCellController — type-and-forward', () => {
  it('forwards a nested keystroke into the root document, offset by the cell\'s anchor', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 7, 7); // "b", caret at end

    controller.nestedView!.dispatch({ changes: { from: 1, to: 1, insert: 'ee' } });

    expect(root.state.doc.toString()).toBe('| a | bee |\n| - | - |');
  });
});

describe('TableActiveCellController — switching cells reuses the one nested editor', () => {
  it('activating A, then B, then A again never creates more than one EditorView instance', () => {
    const root = mountRootView('| a | b | c |\n| - | - | - |');
    const controller = new TableActiveCellController();
    const containerA = makeContainer();
    const containerB = makeContainer();
    const containerC = makeContainer();

    controller.activate(root, containerA, 2, 3, 2); // "a"
    const first = controller.nestedView;
    controller.activate(root, containerB, 6, 7, 6); // "b"
    controller.activate(root, containerC, 10, 11, 10); // "c"
    controller.activate(root, containerA, 2, 3, 2); // back to "a"

    expect(controller.nestedView).toBe(first);
    expect(controller.nestedView!.state.doc.toString()).toBe('a');
    expect(containerA.contains(controller.nestedView!.dom)).toBe(true);
    expect(containerB.contains(controller.nestedView!.dom)).toBe(false);
    expect(containerC.contains(controller.nestedView!.dom)).toBe(false);
  });
});

describe('TableActiveCellController — undo/redo reconciliation', () => {
  it('Mod-z in the nested editor undoes on the root, then reconcileNestedFromRoot syncs the nested doc back', () => {
    const controller = new TableActiveCellController();
    // Wires remapActiveAnchor the way tableWidgetField.update() will in
    // production (§5) — every root transaction, synchronously — since
    // this test drives undo/redo directly rather than through a mounted
    // tableWidgetField.
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const root = new EditorView({
      state: EditorState.create({
        doc: '| a | b |\n| - | - |',
        extensions: [
          markdownLanguageExtension(),
          history(),
          EditorView.updateListener.of((update) => {
            for (const tr of update.transactions) {
              controller.remapActiveAnchor(tr);
            }
          }),
        ],
      }),
      parent,
    });
    mountedViews.push(root);
    const container = makeContainer();

    controller.activate(root, container, 6, 7, 7); // "b"
    controller.nestedView!.dispatch({ changes: { from: 1, to: 1, insert: 'ee' } });
    expect(root.state.doc.toString()).toBe('| a | bee |\n| - | - |');

    undo(root);
    expect(root.state.doc.toString()).toBe('| a | b |\n| - | - |');

    controller.reconcileNestedFromRoot(root);
    expect(controller.nestedView!.state.doc.toString()).toBe('b');

    redo(root);
    controller.reconcileNestedFromRoot(root);
    expect(root.state.doc.toString()).toBe('| a | bee |\n| - | - |');
    expect(controller.nestedView!.state.doc.toString()).toBe('bee');
  });

  it('root has no independent history field left dangling in the nested editor (enableHistory: false)', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 7, 7);
    controller.nestedView!.dispatch({ changes: { from: 1, to: 1, insert: 'z' } });

    // undo() on the nested view itself is a structural no-op — no history field installed.
    expect(undo(controller.nestedView!)).toBe(false);
  });
});

describe('TableActiveCellController — empty-cell activation', () => {
  it('activates an empty cell with an empty nested document and caret at 0', () => {
    const root = mountRootView('| a | |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 6, 6);

    expect(controller.nestedView!.state.doc.toString()).toBe('');
    expect(controller.nestedView!.state.selection.main.head).toBe(0);
  });

  it('typing into a just-activated empty cell forwards correctly into the root document', () => {
    const root = mountRootView('| a | |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 6, 6);
    controller.nestedView!.dispatch({ changes: { from: 0, to: 0, insert: 'x' } });

    expect(root.state.doc.toString()).toBe('| a | x|\n| - | - |');
  });
});

describe('TableActiveCellController — remapActiveAnchor ordering', () => {
  it('remaps the anchor synchronously when called, independent of any updateListener tick (ADR-034: StateField/updateListener ordering hazard)', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 7, 6); // "b" at [6,7)

    const tr = root.state.update({ changes: { from: 0, to: 0, insert: 'XX' } });
    controller.remapActiveAnchor(tr);

    expect(controller.activeAnchor).toEqual({ from: 8, to: 9 });
  });

  it('does nothing when no cell is active', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();

    const tr = root.state.update({ changes: { from: 0, to: 0, insert: 'XX' } });
    expect(() => controller.remapActiveAnchor(tr)).not.toThrow();
    expect(controller.activeAnchor).toBeNull();
  });
});

describe('TableActiveCellController — deactivate/destroy', () => {
  it('deactivate() un-mounts the DOM but keeps the instance for reuse', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 7, 6);
    const instance = controller.nestedView;

    controller.deactivate();

    expect(controller.activeAnchor).toBeNull();
    expect(container.contains(instance!.dom)).toBe(false);

    controller.activate(root, container, 2, 3, 2);
    expect(controller.nestedView).toBe(instance);
  });

  it('destroy() tears the nested editor down entirely', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 7, 6);

    controller.destroy();

    expect(controller.nestedView).toBeNull();
    expect(controller.activeAnchor).toBeNull();
  });
});
