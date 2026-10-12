// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { editorTheme } from './editorTheme';

describe('editorTheme — caret color', () => {
  it('does not set .cm-content caret-color — dead under drawSelection()\'s Prec.highest hideNativeSelection override', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({ extensions: [editorTheme()] });
    new EditorView({ state, parent });

    const injectedCss = Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    // Our own style module (distinguished from CM6's base theme's
    // hardcoded `&light`/`&dark` .cm-content caret-color rules, which
    // still exist independently) must not reference the design-token
    // variable — that rule was removed once drawSelection() became the
    // rendering baseline, since it could never win against
    // hideNativeSelection's `!important` override. The drawn caret's
    // color now lives in MarkdownEditor.css's `.cm-cursor` rule instead.
    expect(injectedCss).not.toMatch(/caret-color:\s*var\(--editor-caret-color\)/);
  });
});

describe('editorTheme — one style module for every view', () => {
  const styleText = () =>
    Array.from(document.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

  it('returns the same extension on every call', () => {
    expect(editorTheme()).toBe(editorTheme());
  });

  it('adds no further CSS to the document for the second and later views', () => {
    const mount = () => {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      return new EditorView({ state: EditorState.create({ extensions: [editorTheme()] }), parent });
    };

    mount();
    const afterFirst = styleText();

    for (let i = 0; i < 5; i++) {
      mount();
    }

    expect(styleText()).toBe(afterFirst);
  });
});
