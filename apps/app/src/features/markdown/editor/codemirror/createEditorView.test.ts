// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createEditorView } from './createEditorView';

describe('createEditorView — initial cursor position', () => {
  it('places a collapsed selection at doc.length, not position 0', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const view = createEditorView({ doc: 'Hello, world', parent });

    expect(view.state.selection.main.anchor).toBe(view.state.doc.length);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('places the cursor at 0 for an empty document — doc.length is still the correct end position', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const view = createEditorView({ doc: '', parent });

    expect(view.state.selection.main.anchor).toBe(0);
  });
});
