// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { hopLeft, hopRight } from '../semanticToken/tokenKeymap';
import { taskCheckboxDecorations } from './taskCheckboxDecorations';
import { isTaskMarkerNode } from './taskEngagement';

/** Test document: '- [ ] task' — TaskMarker spans [2, 5) ("[ ]"). */
function mountView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension(), taskCheckboxDecorations()],
  });
  return new EditorView({ state, parent });
}

describe('keyboard engagement — TaskMarker', () => {
  it('one position before an at-rest TaskMarker, hopRight hops in to the near boundary — checkbox stays rendered (alwaysAtRest)', () => {
    const view = mountView('- [ ] task', 1); // right before "["

    const handled = hopRight(view, isTaskMarkerNode);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(2);
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
    expect(view.dom.textContent).not.toContain('[ ]');
  });

  it('one position after an at-rest TaskMarker, hopLeft hops in to the near boundary — checkbox stays rendered (alwaysAtRest)', () => {
    const view = mountView('- [ ] task', 6); // right after "]"

    const handled = hopLeft(view, isTaskMarkerNode);

    expect(handled).toBe(true);
    expect(view.state.selection.main.head).toBe(5);
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
  });

  it('keyboard engagement never toggles the checked state — only reveals raw text', () => {
    const view = mountView('- [ ] task', 1);

    hopRight(view, isTaskMarkerNode);

    expect(view.state.doc.toString()).toBe('- [ ] task');
  });
});
