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
