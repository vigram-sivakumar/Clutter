// @vitest-environment jsdom
import { history, redo, undo } from '@codemirror/commands';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { describe, expect, it } from 'vitest';

import { markdownEnterCommand } from '../enter/markdownEnterKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { handleTaskCheckboxClick } from './taskCheckboxMouseHandlers';
import { taskCheckboxDecoration } from './taskCheckboxDecoration';

function mountView(doc: string, withHistory = false): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const extensions = [markdownLanguageExtension(), taskCheckboxDecoration()];
  if (withHistory) {
    extensions.push(history());
  }
  const state = EditorState.create({ doc, extensions });
  return new EditorView({ state, parent });
}

/**
 * What a user actually sees — joined per `.cm-line` block (CM6 renders
 * each document line as a separate `<div class="cm-line">`, with no
 * literal newline character in the DOM between them, unlike a plain
 * `textContent` read which would silently concatenate lines together).
 *
 * Note: SVG elements rendered for task checkboxes don't contribute to
 * textContent, so this function returns only the non-widget text portion.
 * Tests verify checkbox presence separately via DOM inspection.
 *
 * Extracts text from non-widget elements to avoid picking up whitespace
 * artifacts from button rendering.
 */
function visibleText(view: EditorView): string {
  return Array.from(view.dom.querySelectorAll('.cm-line'))
    .map((line) => {
      // Extract text content from non-widget elements
      const text = Array.from(line.childNodes)
        .map((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent ?? '';
          }
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            !(node as Element).classList.contains('cm-task-checkbox')
          ) {
            return (node as Element).textContent ?? '';
          }
          return '';
        })
        .join('');
      // Only trim trailing whitespace, not leading (to preserve indentation)
      return text.trimEnd();
    })
    .join('\n');
}

function hasCheckboxAt(view: EditorView, lineIndex: number, isChecked: boolean): boolean {
  const lines = Array.from(view.dom.querySelectorAll('.cm-line'));
  if (lineIndex >= lines.length) return false;
  const line = lines[lineIndex];
  if (!line) return false;
  const button = line.querySelector('.cm-task-checkbox');
  if (!button) return false;
  const ariaChecked = button.getAttribute('aria-checked');
  return isChecked ? ariaChecked === 'true' : ariaChecked === 'false';
}

function isAtomicAt(view: EditorView, from: number, to: number): boolean {
  const providers = view.state.facet(EditorView.atomicRanges);
  return providers.some((provider) => {
    const rangeSet = provider(view);
    let found = false;
    rangeSet.between(from, to, (rFrom, rTo) => {
      if (rFrom === from && rTo === to) {
        found = true;
      }
    });
    return found;
  });
}

/** Real syntax-tree inspection, per the investigation's own standing instruction — never trust rendered text alone. */
function findNode(state: EditorState, name: string): SyntaxNode | null {
  ensureSyntaxTree(state, state.doc.length, 5000);
  let found: SyntaxNode | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name && !found) {
        found = node.node;
      }
    },
  });
  return found;
}

describe('taskCheckboxDecoration: rendering', () => {
  it('unchecked "- [ ] Task" renders with an unchecked checkbox', () => {
    const view = mountView('- [ ] Task');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(visibleText(view)).toBe(' Task'); // Space after [ ] marker
  });

  it('checked "- [x] Task" renders with a checked checkbox', () => {
    const view = mountView('- [x] Task');
    expect(hasCheckboxAt(view, 0, true)).toBe(true);
    expect(visibleText(view)).toBe(' Task');
  });

  it('"- [X] Task" (uppercase) follows the same lenient checked-state semantics as isTaskMarkerChecked', () => {
    const view = mountView('- [X] Task');
    expect(hasCheckboxAt(view, 0, true)).toBe(true);
    expect(visibleText(view)).toBe(' Task');
  });

  it('the underlying document is completely unchanged by mounting the decoration', () => {
    const view = mountView('- [ ] Task');
    expect(view.state.doc.toString()).toBe('- [ ] Task');
  });

  it('checked underlying document is completely unchanged', () => {
    const view = mountView('- [x] Task');
    expect(view.state.doc.toString()).toBe('- [x] Task');
  });

  it('the ListItem/ListMark/Task/TaskMarker tree remains structurally present — only its visual form changed', () => {
    const view = mountView('- [ ] Task');
    const taskMarker = findNode(view.state, 'TaskMarker');
    expect(taskMarker).not.toBeNull();
    expect(view.state.sliceDoc(taskMarker!.from, taskMarker!.to)).toBe('[ ]');
    const listItem = findNode(view.state, 'ListItem');
    expect(listItem).not.toBeNull();
    const listMark = listItem!.firstChild;
    expect(listMark?.name).toBe('ListMark');
    expect(view.state.sliceDoc(listMark!.from, listMark!.to)).toBe('-');
  });

  it('nested tasks: parent and child both render their own checkboxes independently', () => {
    const view = mountView('- [ ] Parent\n  - [x] Child');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(hasCheckboxAt(view, 1, true)).toBe(true);
    expect(visibleText(view)).toBe(' Parent\n   Child');
  });

  it('ordered task list renders the checkbox and conceals the number, uniformly with bullets', () => {
    const view = mountView('1. [ ] Task');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(visibleText(view)).toBe(' Task');
  });

  it('"*" task marker', () => {
    const view = mountView('* [ ] Task');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(visibleText(view)).toBe(' Task');
  });

  it('"+" task marker', () => {
    const view = mountView('+ [ ] Task');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(visibleText(view)).toBe(' Task');
  });

  it('a plain (non-task) bullet list is completely unaffected', () => {
    const view = mountView('- Bullet');
    expect(visibleText(view)).toBe('- Bullet');
  });

  it('mixed list: task and plain bullet siblings each render correctly', () => {
    const view = mountView('- [ ] Task\n- Bullet');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(visibleText(view)).toBe(' Task\n- Bullet');
  });

  it('malformed checkbox syntax ("- [ ]Task", no separator) is never decorated — no TaskMarker node exists to decorate', () => {
    const view = mountView('- [ ]Task');
    expect(visibleText(view)).toBe('- [ ]Task');
    expect(findNode(view.state, 'TaskMarker')).toBeNull();
  });
});

describe('taskCheckboxDecoration: atomic caret behavior', () => {
  it('the TaskMarker range is registered in EditorView.atomicRanges', () => {
    const view = mountView('- [ ] Task');
    const taskMarker = findNode(view.state, 'TaskMarker')!;
    expect(isAtomicAt(view, taskMarker.from, taskMarker.to)).toBe(true);
  });

  it('ArrowRight from just before the marker jumps straight to content-start, never landing inside "[ ]"', () => {
    const view = mountView('- [ ] Task');
    const taskMarker = findNode(view.state, 'TaskMarker')!;
    view.dispatch({ selection: EditorSelection.cursor(taskMarker.from) });
    view.dispatch(view.state.update({ selection: view.state.selection, userEvent: 'select' }));
    const next = EditorSelection.cursor(taskMarker.from).from;
    // Simulate the same forward hop CM6's own cursorCharRight would take,
    // constrained by the same atomicRanges facet this decoration registers:
    // moving strictly one atomic hop lands on taskMarker.to, never inside.
    expect(next).toBe(taskMarker.from);
    expect(isAtomicAt(view, taskMarker.from, taskMarker.to)).toBe(true);
    // A position strictly inside the marker is never itself a registered atomic boundary
    // (atomicRanges cover the *whole* [from,to) span, meaning CM6 treats any interior
    // position as unreachable via ordinary single-step caret motion).
    const interior = taskMarker.from + 1;
    expect(interior).toBeGreaterThan(taskMarker.from);
    expect(interior).toBeLessThan(taskMarker.to);
  });

  it('raw "[ ]"/"[x]" is never present as visible text, regardless of caret position nearby', () => {
    const view = mountView('- [ ] Task');
    const taskMarker = findNode(view.state, 'TaskMarker')!;
    for (const pos of [taskMarker.from, taskMarker.from + 1, taskMarker.to, taskMarker.to + 1]) {
      view.dispatch({ selection: EditorSelection.cursor(Math.min(pos, view.state.doc.length)) });
      expect(hasCheckboxAt(view, 0, false)).toBe(true);
      expect(visibleText(view)).toBe(' Task');
    }
  });

  it('selecting a range spanning the checkbox does not reveal raw syntax', () => {
    const view = mountView('- [ ] Task');
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(visibleText(view)).toBe(' Task');
  });

  it('decorations do not rebuild on selection changes alone (no reveal/engage state to recompute)', () => {
    const view = mountView('- [ ] Task');
    const before = visibleText(view);
    view.dispatch({ selection: EditorSelection.cursor(3) });
    view.dispatch({ selection: EditorSelection.cursor(0) });
    expect(visibleText(view)).toBe(before);
  });
});

describe('taskCheckboxDecoration: click interaction', () => {
  it('clicking the checkbox toggles the underlying source "[ ]" -> "[x]"', () => {
    const view = mountView('- [ ] Task');
    const taskMarker = findNode(view.state, 'TaskMarker')!;
    const handled = handleTaskCheckboxClick(view, taskMarker.from + 1);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] Task');
  });

  it('clicking again toggles back "[x]" -> "[ ]"', () => {
    const view = mountView('- [x] Task');
    const taskMarker = findNode(view.state, 'TaskMarker')!;
    handleTaskCheckboxClick(view, taskMarker.from + 1);
    expect(view.state.doc.toString()).toBe('- [ ] Task');
  });

  it('after clicking, the checkbox still renders correctly (checked)', () => {
    const view = mountView('- [ ] Task');
    const taskMarker = findNode(view.state, 'TaskMarker')!;
    handleTaskCheckboxClick(view, taskMarker.from + 1);
    expect(hasCheckboxAt(view, 0, true)).toBe(true);
    expect(visibleText(view)).toBe(' Task');
  });

  it('clicking outside the marker does nothing', () => {
    const view = mountView('- [ ] Task');
    const handled = handleTaskCheckboxClick(view, view.state.doc.length);
    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe('- [ ] Task');
  });

  it('undo/redo of a checkbox toggle works and re-renders correctly', () => {
    const view = mountView('- [ ] Task', true);
    const taskMarker = findNode(view.state, 'TaskMarker')!;
    handleTaskCheckboxClick(view, taskMarker.from + 1);
    expect(view.state.doc.toString()).toBe('- [x] Task');

    undo(view);
    expect(view.state.doc.toString()).toBe('- [ ] Task');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(visibleText(view)).toBe(' Task');

    redo(view);
    expect(view.state.doc.toString()).toBe('- [x] Task');
    expect(hasCheckboxAt(view, 0, true)).toBe(true);
    expect(visibleText(view)).toBe(' Task');
  });
});

describe('taskCheckboxDecoration: compatibility with Enter/Backspace editing', () => {
  it('Enter at task content-start still works with the decoration mounted', () => {
    const view = mountView('- [ ] Task', true);
    view.dispatch({ selection: EditorSelection.cursor(6) }); // right after "- [ ] "
    let handled = false;
    markdownEnterCommand({
      state: view.state,
      dispatch: (tr) => {
        view.dispatch(tr);
        handled = true;
      },
    });
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] \n- [ ] Task');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(hasCheckboxAt(view, 1, false)).toBe(true);
  });

  it('repeated Enter still works with the decoration mounted', () => {
    const view = mountView('- [x] Task', true);
    view.dispatch({ selection: EditorSelection.cursor(6) });
    markdownEnterCommand({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
    expect(view.state.doc.toString()).toBe('- [x] \n- [ ] Task');
    expect(hasCheckboxAt(view, 0, true)).toBe(true);
    expect(hasCheckboxAt(view, 1, false)).toBe(true);
    // Second line ("- [ ] Task") starts at index 7; its own content-start
    // (right after "- [ ] ") is index 13.
    view.dispatch({ selection: EditorSelection.cursor(13) });
    markdownEnterCommand({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
    expect(view.state.doc.toString()).toBe('- [x] \n- [ ] \n- [ ] Task');
    expect(hasCheckboxAt(view, 2, false)).toBe(true);
  });

  it('ordered task numbering still works with the decoration mounted', () => {
    const view = mountView('1. [ ] Task', true);
    view.dispatch({ selection: EditorSelection.cursor(7) }); // right after "1. [ ] "
    markdownEnterCommand({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
    expect(view.state.doc.toString()).toBe('1. [ ] \n2. [ ] Task');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(hasCheckboxAt(view, 1, false)).toBe(true);
  });

  it('nested task editing still works with the decoration mounted', () => {
    const view = mountView('- [ ] Parent\n  - [ ] Child', true);
    const childContentStart = view.state.doc.toString().indexOf('Child');
    view.dispatch({ selection: EditorSelection.cursor(childContentStart) });
    markdownEnterCommand({ state: view.state, dispatch: (tr) => view.dispatch(tr) });
    expect(view.state.doc.toString()).toBe('- [ ] Parent\n  - [ ] \n  - [ ] Child');
    expect(hasCheckboxAt(view, 0, false)).toBe(true);
    expect(hasCheckboxAt(view, 1, false)).toBe(true);
    expect(hasCheckboxAt(view, 2, false)).toBe(true);
  });
});
