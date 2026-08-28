// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { getTaskCheckboxActivation } from './taskCheckboxActivation';
import { findTaskMarkerAt } from './taskEngagement';

/**
 * `handleTaskCheckboxClick`/`taskCheckboxMouseHandlers.ts` (formerly
 * tested below, alongside a `listMarkerDecoration()`-mounted view) were
 * deleted with the rest of the old list-marker implementation — that
 * click-position-resolution wrapper was built specifically around
 * `listMarkerDecoration.ts`'s combined marker range, which no longer
 * exists. `getTaskCheckboxActivation` itself (tested below) has no such
 * dependency — it operates purely on a `TaskMarkerNodeRange` from
 * `taskEngagement.ts` and the document, independent of any list
 * rendering — so its own coverage stays intact with no
 * `listMarkerDecoration()` extension needed at all. Click-driven
 * checkbox toggling needs to be rebuilt against whatever the new list
 * architecture's own marker-range concept turns out to be, once task
 * lists are reached.
 */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension()],
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
