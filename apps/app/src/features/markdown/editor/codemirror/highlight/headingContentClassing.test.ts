// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkLivePreview } from '../wikilink/wikiLinkLivePreview';
import { createInlineLivePreviewParticipants } from './inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from './inlineLivePreviewRegion';
import { headingMarkerDecoration } from './headingMarkerDecoration';

/**
 * Coverage for heading content classing (`tok-heading1`-`tok-heading6`),
 * now emitted directly by `inlineLivePreviewRegion.ts`'s own unconditional
 * heading branch rather than the retired, independent
 * `headingHighlighting()` — see that file's doc comment and
 * docs/editor-architecture-decisions.md's "Heading content classing moved
 * into the shared decoration source" correction entry for why.
 *
 * Mounts the same combination of extensions `MarkdownEditor.tsx` actually
 * registers for headings (`headingMarkerDecoration` +
 * `inlineLivePreviewRegion` + `wikiLinkLivePreview`), not an isolated
 * subset — the bug this replaces was specifically about composition
 * *between* independently-registered extensions, so isolated-extension
 * tests can't see it.
 */
function mountView(doc: string, anchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: anchor === null ? undefined : { anchor },
    extensions: [
      markdownLanguageExtension(),
      headingMarkerDecoration(),
      inlineLivePreviewRegion(
        createInlineLivePreviewParticipants({ resolveTag: () => undefined, resolveDate: () => undefined })
      ),
      wikiLinkLivePreview(() => undefined),
    ],
  });
  return new EditorView({ state, parent });
}

describe('heading content classing (inlineLivePreviewRegion)', () => {
  it('ATX H1-H6 each get their own tok-headingN class on the revealed text, and only that one', () => {
    for (let level = 1; level <= 6; level += 1) {
      const marker = '#'.repeat(level);
      const view = mountView(`${marker} Heading\n\nOther`, `${marker} Heading`.length + 2);
      expect(view.dom.querySelector(`.tok-heading${level}`)).toBeTruthy();
      for (let other = 1; other <= 6; other += 1) {
        if (other === level) continue;
        expect(view.dom.querySelector(`.tok-heading${other}`)).toBeFalsy();
      }
    }
  });

  it('Setext H1 (===) gets tok-heading1, underline excluded from the visible content', () => {
    const view = mountView('Heading\n===\n\nOther', 'Heading\n===\n\n'.length);
    expect(view.dom.querySelector('.tok-heading1')).toBeTruthy();
    expect(view.dom.textContent).toContain('Heading');
    expect(view.dom.textContent).not.toContain('===');
  });

  it('Setext H2 (---) gets tok-heading2', () => {
    const view = mountView('Heading\n---\n\nOther', 'Heading\n---\n\n'.length);
    expect(view.dom.querySelector('.tok-heading2')).toBeTruthy();
  });

  it('marker concealment at rest is unaffected — no "#" in the DOM', () => {
    const text = '# Heading\n\nOther';
    const view = mountView(text, text.indexOf('Other'));
    expect(view.dom.textContent).not.toContain('#');
    expect(view.dom.textContent).toContain('Heading');
  });

  it('revealed marker still renders wrapped in tok-heading1, matching prior TreeHighlighter parity', () => {
    const view = mountView('# Heading\n\nOther', 1);
    const line = view.dom.querySelector('.cm-line');
    expect(line?.innerHTML).toBe('<span class="tok-heading1"># Heading</span>');
  });

  it('#tag is not styled as a heading — parser never tags it heading1-6', () => {
    const view = mountView('#tag\n\nOther', 'Other'.length + 6);
    expect(view.dom.querySelector('[class*="tok-heading"]')).toBeFalsy();
  });

  it('document text is never mutated by heading classing', () => {
    const text = '# Heading';
    const view = mountView(text, 5);
    expect(view.state.doc.toString()).toBe(text);
  });

  describe('composition with nested shared-set participants — single source, no split/duplicate wrapper', () => {
    const cases: Array<{ label: string; text: string; innerSelector: string; innerText: string }> = [
      { label: 'Highlight', text: '# ==Heading==', innerSelector: '.tok-highlight', innerText: 'Heading' },
      { label: 'Bold', text: '# **Bold** heading', innerSelector: '.tok-strong', innerText: 'Bold' },
      { label: 'Italic', text: '# *Italic* heading', innerSelector: '.tok-emphasis', innerText: 'Italic' },
      { label: 'Strikethrough', text: '# ~~Strike~~ heading', innerSelector: '.tok-strike', innerText: 'Strike' },
      { label: 'Link', text: '# [text](https://example.com)', innerSelector: '.tok-link', innerText: 'text' },
    ];

    for (const { label, text, innerSelector, innerText } of cases) {
      it(`${label} inside a heading nests INSIDE tok-heading1, not as a sibling`, () => {
        const doc = `${text}\n\nOther`;
        const view = mountView(doc, doc.indexOf('Other'));

        const outer = view.dom.querySelector('.tok-heading1');
        expect(outer).toBeTruthy();
        const inner = outer?.querySelector(innerSelector);
        expect(inner).toBeTruthy();
        expect(inner?.textContent).toBe(innerText);

        // No duplicate: exactly one element carries the inner class.
        expect(view.dom.querySelectorAll(innerSelector).length).toBe(1);
      });
    }

    it('WikiLink inside a heading: widget renders inside tok-heading1, no raw [[ ]] visible', () => {
      const doc = '# [[Page]]\n\nOther';
      const view = mountView(doc, doc.indexOf('Other'));
      const outer = view.dom.querySelector('.tok-heading1');
      expect(outer).toBeTruthy();
      expect(outer?.textContent).not.toContain('[[');
      expect(outer?.querySelector('[class*="tok-wikilink"]') ?? outer?.textContent).toBeTruthy();
    });

    it('exact-coincidence case: heading whose ENTIRE content is one Highlight construct still nests correctly', () => {
      const doc = '# ==Heading==\n\nOther';
      const view = mountView(doc, doc.indexOf('Other'));
      const outer = view.dom.querySelector('.tok-heading1');
      const inner = outer?.querySelector('.tok-highlight');
      expect(inner).toBeTruthy();
      expect(inner?.textContent).toBe('Heading');
    });

    it('exact-coincidence case: heading whose ENTIRE content is one WikiLink still nests correctly', () => {
      const doc = '# [[Page]]\n\nOther';
      const view = mountView(doc, doc.indexOf('Other'));
      const outer = view.dom.querySelector('.tok-heading1');
      expect(outer).toBeTruthy();
      expect(outer?.textContent).not.toContain('[[');
    });

    it('Bold+WikiLink nested two levels inside a heading composes correctly (three-level nesting)', () => {
      const doc = '# **[[Page]]**\n\nOther';
      const view = mountView(doc, doc.indexOf('Other'));
      const headingSpan = view.dom.querySelector('.tok-heading1');
      const strongSpan = headingSpan?.querySelector('.tok-strong');
      expect(strongSpan).toBeTruthy();
      expect(strongSpan?.textContent).not.toContain('[[');
    });
  });

  describe('nested-construct engagement stays independent of the heading', () => {
    it('cursor inside a nested Highlight reveals only that Highlight, not the whole heading raw', () => {
      const doc = '# ==Heading==\n\nOther';
      const insideHighlight = doc.indexOf('Heading') + 2;
      const view = mountView(doc, insideHighlight);
      const lineText = view.dom.querySelector('.cm-line')?.textContent ?? '';
      expect(lineText).toContain('==Heading==');
      // The marker's own reveal is governed by headingMarkerDecoration's
      // independent, physical-line engagement (unchanged by this work) —
      // it also reveals here since the cursor is on the same line, which
      // is expected and unrelated to the Highlight's own engagement.
    });

    it('cursor elsewhere in the heading (not in the nested Highlight) keeps the Highlight concealed', () => {
      const doc = '# ==Heading== more\n\nOther';
      const cursorInMore = doc.indexOf('more') + 1;
      const view = mountView(doc, cursorInMore);
      const lineText = view.dom.querySelector('.cm-line')?.textContent ?? '';
      expect(lineText).not.toContain('==');
      expect(lineText).toContain('Heading');
      expect(view.dom.querySelector('.tok-highlight')).toBeTruthy();
    });

    it('cursor inside a nested WikiLink reveals it independently of heading state', () => {
      const doc = '# [[Page]] more\n\nOther';
      const insideLink = doc.indexOf('Page');
      const view = mountView(doc, insideLink);
      const lineText = view.dom.querySelector('.cm-line')?.textContent ?? '';
      expect(lineText).toContain('[[Page]]');
    });
  });

  describe('marker engagement (physical-line) is unaffected by content classing', () => {
    it('cursor anywhere on the ATX heading line still reveals the marker (existing physical-line behavior, unchanged)', () => {
      const doc = '# Heading\n\nOther';
      const view = mountView(doc, doc.indexOf('Heading') + 3);
      const lineText = view.dom.querySelector('.cm-line')?.textContent ?? '';
      expect(lineText.startsWith('#')).toBe(true);
    });

    it('cursor outside the heading line keeps the marker concealed', () => {
      const doc = '# Heading\n\nOther';
      const view = mountView(doc, doc.indexOf('Other'));
      const lineText = view.dom.querySelector('.cm-line')?.textContent ?? '';
      expect(lineText.startsWith('#')).toBe(false);
      expect(lineText).toBe('Heading');
    });
  });
});
