// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { createInlineLivePreviewParticipants } from './inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from './inlineLivePreviewRegion';

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

function mount(doc: string, caret = 0): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: caret },
      extensions: [
        markdownLanguageExtension(),
        inlineLivePreviewRegion(createInlineLivePreviewParticipants({ resolveTag: () => undefined, resolveDate: () => undefined })),
      ],
    }),
    parent,
  });
  views.push(view);
  return view;
}

/** What the user sees: concealed marker widgets carry no text of their own. */
function visibleText(view: EditorView): string {
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
  walk(view.contentDOM);
  return result;
}

describe('<u>…</u> in the live editor', () => {
  it('renders the text underlined and hides the tags while the caret is elsewhere', () => {
    const view = mount('This is <u>underlined text</u> in a note.', 0);
    const underlined = view.dom.querySelector('.tok-underline');

    expect(underlined?.textContent).toBe('underlined text');
    expect(visibleText(view)).toBe('This is underlined text in a note.');
    expect(view.state.doc.toString()).toBe('This is <u>underlined text</u> in a note.');
  });

  it('shows the tags as source while the caret is inside the underline', () => {
    const view = mount('a <u>word</u> b', 6);

    expect(view.dom.querySelector('.cm-underline-marker')).not.toBeNull();
    expect(visibleText(view)).toBe('a <u>word</u> b');
  });

  it('composes with bold inside and outside it', () => {
    const inner = mount('<u>**x**</u> end', 14);
    expect(inner.dom.querySelector('.tok-underline .tok-strong')?.textContent).toBe('x');

    const outer = mount('**<u>x</u>** end', 14);
    expect(outer.dom.querySelector('.tok-strong .tok-underline')?.textContent).toBe('x');
  });

  it('composes with strikethrough on one element, never through an ancestor strike', () => {
    const view = mount('~~<u>gone</u>~~ end', 18);
    const underlined = view.dom.querySelector('.tok-underline');

    expect(underlined?.classList.contains('tok-strike')).toBe(true);
    expect(underlined?.closest('.tok-strike:not(.tok-underline)')).toBeNull();
  });

  it('leaves a literal <u> in a code span as code', () => {
    const view = mount('`<u>x</u>` end', 12);
    expect(view.dom.querySelector('.tok-underline')).toBeNull();
  });

  it('does not render an unpaired <u> as underline', () => {
    const view = mount('a <u> b', 0);
    expect(view.dom.querySelector('.tok-underline')).toBeNull();
  });

  it('keeps links and wiki links next to an underline intact', () => {
    const view = mount('<u>x</u> [[Lists]] [l](http://a.b)', 30);
    expect(view.dom.querySelector('.tok-underline')?.textContent).toBe('x');
    expect(view.state.doc.toString()).toBe('<u>x</u> [[Lists]] [l](http://a.b)');
  });
});
