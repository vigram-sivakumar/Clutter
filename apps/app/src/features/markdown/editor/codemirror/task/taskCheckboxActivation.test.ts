// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { getTaskCheckboxActivation } from './taskCheckboxActivation';
import { findTaskMarkerAt } from './taskEngagement';
import { handleTaskCheckboxClick } from './taskCheckboxMouseHandlers';
import { taskCheckboxDecorations } from './taskCheckboxDecorations';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), taskCheckboxDecorations()],
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
});

describe('handleTaskCheckboxClick', () => {
  it('a plain click on an at-rest TaskMarker toggles it via the normal dispatch pipeline', () => {
    const view = mountView('- [ ] Buy milk');

    const handled = handleTaskCheckboxClick(view, 2, false);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] Buy milk');
  });

  it('Alt-click on an at-rest TaskMarker engages it (reveals raw text) instead of toggling', () => {
    const view = mountView('- [ ] Buy milk');

    const handled = handleTaskCheckboxClick(view, 2, true);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] Buy milk'); // unchanged
    expect(view.state.selection.main.head).toBe(4); // node.to - 1, inside the marker
  });

  it('clicking a non-task list marker position is a no-op — nothing to toggle', () => {
    const view = mountView('- plain item');

    const handled = handleTaskCheckboxClick(view, 2, false);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe('- plain item');
  });
});
