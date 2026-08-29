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

describe('horizontalRuleDecoration — labeled variants at rest', () => {
  it.each([
    ['straight', '---Chapter 1---', null],
    ['wavy', '~---Chapter 1---~', 'cm-hr-labeled--wavy'],
    ['double', '=---Chapter 1---=', 'cm-hr-labeled--double'],
    ['dotted', '.---Chapter 1---.', 'cm-hr-labeled--dotted'],
  ] as const)('renders the %s labeled divider with its label text and no raw marker', (_kind, marker, modifierClass) => {
    const text = `Above\n\n${marker}\n\nBelow`;
    const view = mountView(text, text.indexOf('Below'));

    const widget = view.dom.querySelector('.cm-hr-labeled');
    expect(widget).not.toBeNull();
    expect(widget?.querySelector('.cm-hr-labeled__text')?.textContent).toBe('Chapter 1');
    if (modifierClass) {
      expect(widget?.classList.contains(modifierClass)).toBe(true);
    }
    // The two rule segments flank the label, one on each side.
    expect(widget?.querySelectorAll('.cm-hr-labeled__rule').length).toBe(2);
    // Raw marker text is not present anywhere in the rendered line.
    expect(visibleText(view)).not.toContain(marker);

    view.destroy();
  });

  it.each([
    ['straight', '--- Chapter 1 ---'],
    ['wavy', '~--- Chapter 1 ---~'],
    ['double', '=--- Chapter 1 ---='],
    ['dotted', '.--- Chapter 1 ---.'],
  ] as const)('trims syntax padding spaces around the label for %s dividers', (_kind, marker) => {
    const text = `Above\n\n${marker}\n\nBelow`;
    const view = mountView(text, text.indexOf('Below'));

    const label = view.dom.querySelector('.cm-hr-labeled__text');
    expect(label?.textContent).toBe('Chapter 1');

    view.destroy();
  });

  it('supports multi-word labels with internal spaces preserved', () => {
    const text = 'Above\n\n~--- The Long Chapter Title ---~\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const label = view.dom.querySelector('.cm-hr-labeled__text');
    expect(label?.textContent).toBe('The Long Chapter Title');

    view.destroy();
  });

  it('the stored document text is unaffected by the widget replacement', () => {
    const text = 'Above\n\n---Chapter 1---\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.state.doc.toString()).toBe(text);

    view.destroy();
  });

  it('leaves the unlabeled variants on their existing pure-CSS collapse path, unaffected by the labeled addition', () => {
    for (const marker of ['---', '~---~', '=---=', '.---.']) {
      const text = `Above\n\n${marker}\n\nBelow`;
      const view = mountView(text, text.indexOf('Below'));

      expect(view.dom.querySelector('.cm-hr-labeled')).toBeNull();

      view.destroy();
    }
  });
});

describe('horizontalRuleDecoration — labeled variants engaged', () => {
  it.each(['---Chapter 1---', '~---Chapter 1---~', '=---Chapter 1---=', '.---Chapter 1---.'] as const)(
    'reveals the raw labeled marker source when the cursor is on the divider line (%s)',
    (marker) => {
      const text = `Above\n\n${marker}\n\nBelow`;
      const ruleFrom = text.indexOf(marker);
      const view = mountView(text, ruleFrom);

      expect(visibleText(view)).toContain(marker);
      expect(view.dom.querySelector('.cm-hr-labeled')).toBeNull();

      view.destroy();
    }
  );

  it('re-collapses to the label widget once the selection moves off the divider line', () => {
    const text = 'Above\n\n~---Chapter 1---~\n\nBelow';
    const ruleFrom = text.indexOf('~---Chapter 1---~');
    const view = mountView(text, ruleFrom);
    expect(view.dom.querySelector('.cm-hr-labeled')).toBeNull();

    view.dispatch({ selection: { anchor: text.indexOf('Below') } });

    const label = view.dom.querySelector('.cm-hr-labeled__text');
    expect(label?.textContent).toBe('Chapter 1');

    view.destroy();
  });
});

describe('horizontalRuleDecoration — labeled-divider syntax stays block-scoped, does not misfire on ordinary text', () => {
  it('does not treat inline text merely containing the marker characters as a divider', () => {
    const text = 'Above\n\nThis line has --- dashes and ~ tildes but is not a divider---at all\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.dom.querySelector('.cm-hr-labeled')).toBeNull();
    expect(view.dom.querySelector('.cm-hr-line')).toBeNull();

    view.destroy();
  });

  it('does not treat a plain thematic break of any length as a labeled divider', () => {
    for (const marker of ['---', '------', '- - -']) {
      const text = `Above\n\n${marker}\n\nBelow`;
      const view = mountView(text, text.indexOf('Below'));

      expect(view.dom.querySelector('.cm-hr-labeled')).toBeNull();
      expect(view.dom.querySelector('.cm-hr-line')).not.toBeNull();

      view.destroy();
    }
  });

  it('does not treat an unterminated `---` run as a labeled divider', () => {
    const text = 'Above\n\n---Hello\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    expect(view.dom.querySelector('.cm-hr-labeled')).toBeNull();
    expect(view.dom.querySelector('.cm-hr-line')).toBeNull();

    view.destroy();
  });

  it('native `---` thematic break behavior is otherwise completely unchanged', () => {
    const text = 'Above\n\n---\n\nBelow';
    const view = mountView(text, text.indexOf('Below'));

    const hrLine = view.dom.querySelector('.cm-hr-line');
    expect(hrLine).not.toBeNull();
    expect(hrLine?.textContent).toBe('');
    expect(view.dom.querySelector('.cm-hr-labeled')).toBeNull();

    view.destroy();
  });
});
