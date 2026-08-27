// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkLivePreview } from '../wikilink/wikiLinkLivePreview';
import { horizontalRuleDecoration } from './horizontalRuleDecoration';

/** Mirrors tableDecoration.test.ts's mountView. */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), horizontalRuleDecoration()],
  });
  return new EditorView({ state, parent });
}

/** Same as mountView, plus every inline Live Preview mechanism active alongside it — the combination the compatibility investigation checked. */
function mountViewWithInlineConstructs(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [
      markdownLanguageExtension(),
      inlineLivePreviewRegion(
        createInlineLivePreviewParticipants({ resolveTag: () => undefined, resolveDate: () => undefined })
      ),
      wikiLinkLivePreview(() => () => ({ status: 'resolved', displayLabel: 'Page', activate: () => {} })),
      horizontalRuleDecoration(),
    ],
  });
  return new EditorView({ state, parent });
}

/**
 * What a user actually sees — see inlineLivePreviewRegion.test.ts's own
 * `visibleText` doc comment for the full rationale. Needed here because
 * migrated constructs (bold/strikethrough) appear in the surrounding
 * paragraphs these tests exercise, and their concealed marker text
 * (`cm-marker--concealed`) is a widget with no text of its own (see
 * inlineLivePreviewRegion.test.ts's `visibleText` comment).
 */
function visibleText(target: EditorView | Node | null | undefined): string {
  if (!target) {
    return '';
  }
  const root: Node = 'dom' in target ? target.dom : target;
  let result = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).classList.contains('cm-marker--concealed')) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return result;
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

    expect(visibleText(view)).toContain('---');
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

describe('horizontalRuleDecoration — wavy variant (`~---~`) at rest', () => {
  it('collapses the wavy rule line under its own class, hiding its raw marker text', () => {
    const text = 'Above\n\n~---~\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const wavyLine = view.dom.querySelector('.cm-hr-line-wavy');
    expect(wavyLine).not.toBeNull();
    expect(wavyLine?.textContent).toBe('');
    expect(view.dom.querySelector('.cm-hr-line')).toBeNull();
  });

  it('the stored document text is unaffected by the collapse', () => {
    const text = 'Above\n\n~---~\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.state.doc.toString()).toBe(text);
  });

  it('interrupts an in-progress paragraph without a blank line first, unlike plain `---`', () => {
    const text = 'Above\n~---~\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const wavyLine = view.dom.querySelector('.cm-hr-line-wavy');
    expect(wavyLine).not.toBeNull();
    expect(wavyLine?.textContent).toBe('');
  });

  it('does not collapse a bare `---` on the same line as content, straight rule behavior is unchanged', () => {
    const text = 'Above\n\n---\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.dom.querySelector('.cm-hr-line')).not.toBeNull();
    expect(view.dom.querySelector('.cm-hr-line-wavy')).toBeNull();
  });
});

describe('horizontalRuleDecoration — wavy variant engaged', () => {
  it('reveals the raw `~---~` marker text when the cursor is on the rule line itself', () => {
    const text = 'Above\n\n~---~\n\nBelow';
    const ruleFrom = text.indexOf('~---~');
    const view = mountView(text, ruleFrom);

    expect(visibleText(view)).toContain('~---~');
  });

  it('does not carry the collapsing line class while engaged', () => {
    const text = 'Above\n\n~---~\n\nBelow';
    const ruleFrom = text.indexOf('~---~');
    const view = mountView(text, ruleFrom);

    expect(view.dom.querySelector('.cm-hr-line-wavy')).toBeNull();
  });

  it('re-collapses once the selection moves off the rule line', () => {
    const text = 'Above\n\n~---~\n\nBelow';
    const ruleFrom = text.indexOf('~---~');
    const view = mountView(text, ruleFrom);
    expect(view.dom.querySelector('.cm-hr-line-wavy')).toBeNull();

    view.dispatch({ selection: { anchor: text.indexOf('Below') } });

    const wavyLine = view.dom.querySelector('.cm-hr-line-wavy');
    expect(wavyLine).not.toBeNull();
    expect(wavyLine?.textContent).toBe('');
  });
});

describe('horizontalRuleDecoration — double variant (`=---=`) at rest', () => {
  it('collapses the double rule line under its own class, hiding its raw marker text', () => {
    const text = 'Above\n\n=---=\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const doubleLine = view.dom.querySelector('.cm-hr-line-double');
    expect(doubleLine).not.toBeNull();
    expect(doubleLine?.textContent).toBe('');
    expect(view.dom.querySelector('.cm-hr-line')).toBeNull();
    expect(view.dom.querySelector('.cm-hr-line-wavy')).toBeNull();
  });

  it('the stored document text is unaffected by the collapse', () => {
    const text = 'Above\n\n=---=\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.state.doc.toString()).toBe(text);
  });

  it('interrupts an in-progress paragraph without a blank line first, unlike plain `---`', () => {
    const text = 'Above\n=---=\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const doubleLine = view.dom.querySelector('.cm-hr-line-double');
    expect(doubleLine).not.toBeNull();
    expect(doubleLine?.textContent).toBe('');
  });

  it('does not collapse a bare `---` or `~---~` on their own lines, other rule variants are unchanged', () => {
    const text = 'Above\n\n---\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.dom.querySelector('.cm-hr-line')).not.toBeNull();
    expect(view.dom.querySelector('.cm-hr-line-double')).toBeNull();
  });
});

describe('horizontalRuleDecoration — double variant engaged', () => {
  it('reveals the raw `=---=` marker text when the cursor is on the rule line itself', () => {
    const text = 'Above\n\n=---=\n\nBelow';
    const ruleFrom = text.indexOf('=---=');
    const view = mountView(text, ruleFrom);

    expect(visibleText(view)).toContain('=---=');
  });

  it('does not carry the collapsing line class while engaged', () => {
    const text = 'Above\n\n=---=\n\nBelow';
    const ruleFrom = text.indexOf('=---=');
    const view = mountView(text, ruleFrom);

    expect(view.dom.querySelector('.cm-hr-line-double')).toBeNull();
  });

  it('re-collapses once the selection moves off the rule line', () => {
    const text = 'Above\n\n=---=\n\nBelow';
    const ruleFrom = text.indexOf('=---=');
    const view = mountView(text, ruleFrom);
    expect(view.dom.querySelector('.cm-hr-line-double')).toBeNull();

    view.dispatch({ selection: { anchor: text.indexOf('Below') } });

    const doubleLine = view.dom.querySelector('.cm-hr-line-double');
    expect(doubleLine).not.toBeNull();
    expect(doubleLine?.textContent).toBe('');
  });
});

describe('horizontalRuleDecoration — dotted variant (`.---.`) at rest', () => {
  it('collapses the dotted rule line under its own class, hiding its raw marker text', () => {
    const text = 'Above\n\n.---.\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const dottedLine = view.dom.querySelector('.cm-hr-line-dotted');
    expect(dottedLine).not.toBeNull();
    expect(dottedLine?.textContent).toBe('');
    expect(view.dom.querySelector('.cm-hr-line')).toBeNull();
    expect(view.dom.querySelector('.cm-hr-line-wavy')).toBeNull();
    expect(view.dom.querySelector('.cm-hr-line-double')).toBeNull();
  });

  it('the stored document text is unaffected by the collapse', () => {
    const text = 'Above\n\n.---.\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.state.doc.toString()).toBe(text);
  });

  it('interrupts an in-progress paragraph without a blank line first, unlike plain `---`', () => {
    const text = 'Above\n.---.\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const dottedLine = view.dom.querySelector('.cm-hr-line-dotted');
    expect(dottedLine).not.toBeNull();
    expect(dottedLine?.textContent).toBe('');
  });

  it('does not collapse the other rule variants, they remain unchanged', () => {
    const text = 'Above\n\n---\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.dom.querySelector('.cm-hr-line')).not.toBeNull();
    expect(view.dom.querySelector('.cm-hr-line-dotted')).toBeNull();
  });
});

describe('horizontalRuleDecoration — dotted variant engaged', () => {
  it('reveals the raw `.---.` marker text when the cursor is on the rule line itself', () => {
    const text = 'Above\n\n.---.\n\nBelow';
    const ruleFrom = text.indexOf('.---.');
    const view = mountView(text, ruleFrom);

    expect(visibleText(view)).toContain('.---.');
  });

  it('does not carry the collapsing line class while engaged', () => {
    const text = 'Above\n\n.---.\n\nBelow';
    const ruleFrom = text.indexOf('.---.');
    const view = mountView(text, ruleFrom);

    expect(view.dom.querySelector('.cm-hr-line-dotted')).toBeNull();
  });

  it('re-collapses once the selection moves off the rule line', () => {
    const text = 'Above\n\n.---.\n\nBelow';
    const ruleFrom = text.indexOf('.---.');
    const view = mountView(text, ruleFrom);
    expect(view.dom.querySelector('.cm-hr-line-dotted')).toBeNull();

    view.dispatch({ selection: { anchor: text.indexOf('Below') } });

    const dottedLine = view.dom.querySelector('.cm-hr-line-dotted');
    expect(dottedLine).not.toBeNull();
    expect(dottedLine?.textContent).toBe('');
  });
});

/**
 * Permanent regression coverage for the WikiLink-extraction/Link-addition
 * compatibility investigation: Divider is a block-level, physical-line-
 * scoped standalone renderer with no inline children of its own, so it can
 * never share a decorated range with any inline construct — confirmed here
 * rather than only reasoned about.
 */
describe('horizontalRuleDecoration — compatible with every inline Live Preview construct', () => {
  it('collapses correctly with WikiLink/Link/Tag/emphasis active in the surrounding paragraphs, which render unaffected', () => {
    const doc = '**bold** [[Page]] [text](https://example.com) #tag\n\n---\n\nMore ~~text~~';
    const view = mountViewWithInlineConstructs(doc, doc.length);

    expect(visibleText(view)).toBe('bold Page text #tagMore ~~text~~');
    expect(view.dom.querySelector('.cm-hr-line')).not.toBeNull();
  });

  it('engaging the rule line reveals its marker without disturbing adjacent inline rendering', () => {
    const doc = '**bold** [[Page]] [text](https://example.com) #tag\n\n---\n\nMore ~~text~~';
    const view = mountViewWithInlineConstructs(doc, doc.indexOf('---'));

    expect(visibleText(view)).toBe('bold Page text #tag---More text');
  });

  it('engaging a WikiLink in the paragraph leaves the rule line collapsed', () => {
    const doc = '**bold** [[Page]] [text](https://example.com) #tag\n\n---\n\nMore ~~text~~';
    const view = mountViewWithInlineConstructs(doc, doc.indexOf('Page') + 1);

    expect(visibleText(view)).toBe('bold [[Page]] text #tagMore text');
    expect(view.dom.querySelector('.cm-hr-line')).not.toBeNull();
  });
});
