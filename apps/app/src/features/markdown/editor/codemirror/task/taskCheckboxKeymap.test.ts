// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { hopLeft, hopRight } from '../semanticToken/tokenKeymap';
import { listMarkerDecoration } from '../highlight/listMarkerDecoration';
import { isTaskMarkerNode } from './taskEngagement';

/** Test document: '- [ ] task' — TaskMarker spans [2, 5) ("[ ]"). */
function mountView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension(), listMarkerDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('keyboard navigation over the TaskMarker — cursor moves, rendering never changes', () => {
  it('hopRight moves the caret to the near boundary; the checkbox stays rendered (parser-driven, not selection-driven)', () => {
    const view = mountView('- [ ] task', 1); // right before "["

    const handled = hopRight(view, isTaskMarkerNode);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
    expect(view.dom.textContent).not.toContain('[ ]');
  });

  it('hopLeft moves the caret to the near boundary; the checkbox stays rendered', () => {
    const view = mountView('- [ ] task', 6); // right after "]"

    const handled = hopLeft(view, isTaskMarkerNode);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(5);
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
    expect(view.dom.textContent).not.toContain('[ ]');
  });

  it('keyboard navigation never toggles the checked state and never mutates the document', () => {
    const view = mountView('- [ ] task', 1);

    hopRight(view, isTaskMarkerNode);

    expect(view.state.doc.toString()).toBe('- [ ] task');
  });
});
