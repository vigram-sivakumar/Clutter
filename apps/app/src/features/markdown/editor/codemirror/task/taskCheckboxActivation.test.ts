// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { getTaskCheckboxActivation } from './taskCheckboxActivation';
import { findTaskMarkerAt } from './taskEngagement';
import { handleTaskCheckboxClick } from './taskCheckboxMouseHandlers';
import { listMarkerDecoration } from '../highlight/listMarkerDecoration';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), listMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('getTaskCheckboxActivation', () => {
  it('[ ] -> [x]: activating toggles unchecked to checked', () => {
    const line = '- [ ] Buy milk';
    const view = mountView(line);
    const node = findTaskMarkerAt(view.state, 2)!; // inside "[ ]"

    const activate = getTaskCheckboxActivation(view, node);
    activate?.();

    expect(view.state.doc.toString()).toBe('- [x] Buy milk');
  });

  it('[x] -> [ ]: activating toggles checked to unchecked', () => {
    const line = '- [x] Buy milk';
    const view = mountView(line);
    const node = findTaskMarkerAt(view.state, 2)!;

    const activate = getTaskCheckboxActivation(view, node);
    activate?.();

    expect(view.state.doc.toString()).toBe('- [ ] Buy milk');
  });

  it('[X] -> [ ]: an uppercase checked marker reads as checked and toggles to canonical lowercase unchecked', () => {
    const line = '- [X] Buy milk';
    const view = mountView(line);
    const node = findTaskMarkerAt(view.state, 2)!;

    const activate = getTaskCheckboxActivation(view, node);
    activate?.();

    expect(view.state.doc.toString()).toBe('- [ ] Buy milk');
  });

  it('toggling always writes canonical lowercase "x", never uppercase', () => {
    const view = mountView('- [ ] Buy milk');
    const node = findTaskMarkerAt(view.state, 2)!;

    getTaskCheckboxActivation(view, node)?.();

    expect(view.state.doc.toString()).toContain('[x]');
    expect(view.state.doc.toString()).not.toContain('[X]');
  });

  it('the mutation is a plain document dispatch — only the 3-character TaskMarker range changes', () => {
    const line = '- [ ] Buy milk and eggs';
    const view = mountView(line);
    const node = findTaskMarkerAt(view.state, 2)!;

    getTaskCheckboxActivation(view, node)?.();

    expect(view.state.doc.toString()).toBe('- [x] Buy milk and eggs');
  });

  it('calls requestImmediateSave exactly once, after the dispatch has already committed', () => {
    const view = mountView('- [ ] Buy milk');
    const node = findTaskMarkerAt(view.state, 2)!;
    let docAtCallTime: string | null = null;
    const requestImmediateSave = vi.fn(() => {
      docAtCallTime = view.state.doc.toString();
    });

    getTaskCheckboxActivation(view, node, requestImmediateSave)?.();

    expect(requestImmediateSave).toHaveBeenCalledTimes(1);
    expect(docAtCallTime).toBe('- [x] Buy milk'); // toggle already applied
  });

  it('requestImmediateSave is optional — omitting it does not throw', () => {
    const view = mountView('- [ ] Buy milk');
    const node = findTaskMarkerAt(view.state, 2)!;

    expect(() => getTaskCheckboxActivation(view, node)?.()).not.toThrow();
  });
});

describe('handleTaskCheckboxClick', () => {
  it('a plain click on an at-rest TaskMarker toggles it via the normal dispatch pipeline', () => {
    const view = mountView('- [ ] Buy milk');

    const handled = handleTaskCheckboxClick(view, 2, false);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] Buy milk');
  });

  it('a plain click toggles WITHOUT moving the selection into TaskMarker — the widget stays rendered, since the caret never entered the marker range', () => {
    const text = 'Text before\n\n- [ ] Buy milk';
    const view = mountView(text);
    const taskMarkerStart = text.indexOf('[ ]');
    const selectionBefore = view.state.selection.main; // position 0, well outside the marker range

    handleTaskCheckboxClick(view, taskMarkerStart, false);

    // The selection is untouched by the toggle dispatch — engagement is
    // never a side effect of clicking the checkbox itself.
    expect(view.state.selection.main.from).toBe(selectionBefore.from);
    expect(view.state.selection.main.to).toBe(selectionBefore.to);
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
  });

  it('clicking one checkbox does not affect a sibling task widget', () => {
    const text = '- [ ] first\n- [ ] second';
    const view = mountView(text);
    const secondNode = findTaskMarkerAt(view.state, text.indexOf('second') - 3)!;

    handleTaskCheckboxClick(view, 2, false); // click the first task

    expect(view.state.doc.toString()).toBe('- [x] first\n- [ ] second');
    // The second task's own marker is untouched — re-resolving it confirms
    // its range/content didn't shift or get toggled as a side effect.
    const raw = view.state.sliceDoc(secondNode.from, secondNode.to);
    expect(raw).toBe('[ ]');
  });

  it('Alt-click on an at-rest TaskMarker toggles it the same as a plain click — no special engage behavior', () => {
    const view = mountView('- [ ] Buy milk');

    const handled = handleTaskCheckboxClick(view, 2, true);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] Buy milk');
  });

  it('a plain click requests an immediate save; Alt-click requests it too, same as any other click', () => {
    const view = mountView('- [ ] Buy milk');
    const requestImmediateSave = vi.fn();

    handleTaskCheckboxClick(view, 2, false, requestImmediateSave);
    expect(requestImmediateSave).toHaveBeenCalledTimes(1);

    requestImmediateSave.mockClear();
    const altView = mountView('- [ ] Buy milk');
    handleTaskCheckboxClick(altView, 2, true, requestImmediateSave);
    expect(requestImmediateSave).toHaveBeenCalledTimes(1);
  });

  it('clicking a non-task list marker position is a no-op — nothing to toggle', () => {
    const view = mountView('- plain item');

    const handled = handleTaskCheckboxClick(view, 2, false);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe('- plain item');
  });
});
