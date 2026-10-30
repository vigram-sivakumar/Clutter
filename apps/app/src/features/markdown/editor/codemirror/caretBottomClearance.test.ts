// @vitest-environment jsdom
import { EditorState, type EditorStateConfig } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { caretBottomClearance, caretBottomClearanceExtension } from './caretBottomClearance';

const views: EditorView[] = [];

function makeView(config: EditorStateConfig) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create(config), parent });
  views.push(view);
  return view;
}

function rootWith(vars: Record<string, string>): HTMLElement {
  const root = document.createElement('div');
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  while (views.length) {
    const view = views.pop()!;
    view.destroy();
    view.dom.parentElement?.remove();
  }
});

describe('caretBottomClearance', () => {
  it('is the fade height plus 2.5 editor lines', () => {
    const root = rootWith({ '--page-bottom-fade-height': '48px', '--cm-content': '16px', '--lh-cm-content': '1.5' });
    expect(caretBottomClearance(root)).toBe(48 + 2.5 * 24);
  });

  it('follows the editor font size and line height', () => {
    const root = rootWith({ '--page-bottom-fade-height': '48px', '--cm-content': '20px', '--lh-cm-content': '1.4' });
    expect(caretBottomClearance(root)).toBe(48 + 2.5 * 28);
  });

  it('falls back to the default fade and line when the tokens are missing', () => {
    expect(caretBottomClearance(rootWith({}))).toBe(48 + 2.5 * 24);
  });
});

describe('caretBottomClearanceExtension', () => {
  it('raises the cursor scroll margin vertically and keeps CM6 default horizontally', () => {
    const root = rootWith({ '--page-bottom-fade-height': '48px', '--cm-content': '16px', '--lh-cm-content': '1.5' });
    const view = makeView({ doc: 'a', extensions: [caretBottomClearanceExtension(root)] });
    expect(view.state.facet(EditorView.cursorScrollMargin)).toEqual({ x: 5, y: 108 });
  });

  it('does not use scrollMargins, which would park autocomplete popups off-screen near the end of the note', () => {
    const view = makeView({ doc: 'a', extensions: [caretBottomClearanceExtension(rootWith({}))] });
    expect(view.state.facet(EditorView.scrollMargins)).toHaveLength(0);
  });

  it('leaves a view that does not install it at the default margin', () => {
    const view = makeView({ doc: 'a' });
    expect(view.state.facet(EditorView.cursorScrollMargin)).toEqual({ x: 5, y: 5 });
  });
});
