// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownHighlighting } from '../highlight/markdownHighlightStyle';
import { markdownLanguageExtension } from '../markdownLanguage';
import { horizontalRuleDecoration } from './horizontalRuleDecoration';

/** Mirrors tableDecoration.test.ts's mountView. */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), markdownHighlighting(), horizontalRuleDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('horizontalRuleDecoration — at rest', () => {
  it('collapses the rule line, hiding its raw marker text', () => {
    const text = 'Above\n\n---\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const hrLine = view.dom.querySelector('.cm-hr-line');
    expect(hrLine).not.toBeNull();
    expect(hrLine?.textContent).toBe('');
  });

  it('the stored document text is unaffected by the collapse', () => {
    const text = 'Above\n\n---\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.state.doc.toString()).toBe(text);
  });

  it('collapses `***` and `___` rules the same way as `---`', () => {
    for (const marker of ['***', '___']) {
      const text = `Above\n\n${marker}\n\nBelow`;
      const view = mountView(text, text.indexOf('Below'));

      const hrLine = view.dom.querySelector('.cm-hr-line');
      expect(hrLine).not.toBeNull();
      expect(hrLine?.textContent).toBe('');
    }
  });

  it('does not collapse a `---` immediately under a paragraph line (Setext heading underline, not a thematic break)', () => {
    const text = 'Above\n---\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.dom.querySelector('.cm-hr-line')).toBeNull();
  });
});

describe('horizontalRuleDecoration — engaged', () => {
  it('reveals the raw marker text when the cursor is on the rule line itself', () => {
    const text = 'Above\n\n---\n\nBelow';
    const ruleFrom = text.indexOf('---');
    const view = mountView(text, ruleFrom);

    expect(view.dom.textContent).toContain('---');
  });

  it('does not carry the collapsing line class while engaged, so the revealed text renders at normal size', () => {
    const text = 'Above\n\n---\n\nBelow';
    const ruleFrom = text.indexOf('---');
    const view = mountView(text, ruleFrom);

    expect(view.dom.querySelector('.cm-hr-line')).toBeNull();
  });

  it('re-collapses once the selection moves off the rule line', () => {
    const text = 'Above\n\n---\n\nBelow';
    const ruleFrom = text.indexOf('---');
    const view = mountView(text, ruleFrom);
    expect(view.dom.querySelector('.cm-hr-line')).toBeNull();

    view.dispatch({ selection: { anchor: text.indexOf('Below') } });

    const hrLine = view.dom.querySelector('.cm-hr-line');
    expect(hrLine).not.toBeNull();
    expect(hrLine?.textContent).toBe('');
  });
});
