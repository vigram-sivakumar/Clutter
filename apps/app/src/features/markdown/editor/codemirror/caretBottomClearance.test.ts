// @vitest-environment jsdom
import { EditorState, type EditorStateConfig } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { caretBottomClearance, caretBottomClearanceExtension } from './caretBottomClearance';

const views: EditorView[] = [];

function makeView(extensions: EditorStateConfig) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create(extensions), parent });
  views.push(view);
  return view;
}

afterEach(() => {
  while (views.length) {
    const view = views.pop()!;
    view.destroy();
    view.dom.parentElement?.remove();
  }
});

describe('caretBottomClearance', () => {
  it('is the fade height plus 2.5 lines when both are measurable', () => {
    const view = makeView({ doc: 'a' });
    view.dom.style.setProperty('--page-bottom-fade-height', '48px');
    view.contentDOM.style.lineHeight = '24px';
    expect(caretBottomClearance(view)).toBe(48 + 2.5 * 24);
  });

  it('follows a different line height', () => {
    const view = makeView({ doc: 'a' });
    view.dom.style.setProperty('--page-bottom-fade-height', '48px');
    view.contentDOM.style.lineHeight = '20px';
    expect(caretBottomClearance(view)).toBe(48 + 2.5 * 20);
  });

  it('falls back to defaults when nothing can be measured', () => {
    const view = makeView({ doc: 'a' });
    expect(caretBottomClearance(view)).toBeGreaterThan(48);
  });
});

describe('caretBottomClearanceExtension', () => {
  it('is registered as a bottom-only scroll margin', () => {
    const view = makeView({ doc: 'a', extensions: [caretBottomClearanceExtension()] });
    view.dom.style.setProperty('--page-bottom-fade-height', '48px');
    view.contentDOM.style.lineHeight = '24px';
    const sources = view.state.facet(EditorView.scrollMargins);
    expect(sources).toHaveLength(1);
    expect(sources[0]!(view)).toEqual({ bottom: 108 });
  });

  it('is absent from a view that does not install it', () => {
    const view = makeView({ doc: 'a' });
    expect(view.state.facet(EditorView.scrollMargins)).toHaveLength(0);
  });
});
