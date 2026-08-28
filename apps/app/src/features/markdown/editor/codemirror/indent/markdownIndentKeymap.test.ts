// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownIndentLess, markdownIndentMore } from './markdownIndentKeymap';

function mountView(doc: string, cursor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: Math.min(cursor, doc.length) },
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

function tab(view: EditorView): boolean {
  return markdownIndentMore({ state: view.state, dispatch: (tr) => view.update([tr]) });
}

function shiftTab(view: EditorView): boolean {
  return markdownIndentLess({ state: view.state, dispatch: (tr) => view.update([tr]) });
}

describe('markdownIndentKeymap', () => {
  describe('paragraph: 0 -> 10 via Tab, then no-op, then Shift-Tab back to 0', () => {
    it('Tab progression 0,2,4,6,8,10', () => {
      const view = mountView('paragraph', 0);
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 5; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        'paragraph',
        '  paragraph',
        '    paragraph',
        '      paragraph',
        '        paragraph',
        '          paragraph',
      ]);
    });

    it('Tab at 10 spaces is a no-op (returns true, text unchanged)', () => {
      const view = mountView('          paragraph', 0);
      const before = view.state.doc.toString();
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(before);
    });

    it('Shift-Tab progression 10 -> 0', () => {
      const view = mountView('          paragraph', 0);
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 5; i++) {
        expect(shiftTab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '          paragraph',
        '        paragraph',
        '      paragraph',
        '    paragraph',
        '  paragraph',
        'paragraph',
      ]);
    });

    it('Shift-Tab at 0 spaces is a no-op', () => {
      const view = mountView('paragraph', 0);
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('paragraph');
    });

    it('existing indentation beyond 10 spaces is preserved exactly on open, and Tab on it is a no-op', () => {
      const text = '              paragraph'; // 14 spaces
      const view = mountView(text, 0);
      expect(view.state.doc.toString()).toBe(text); // preserved on open
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(text); // Tab never touches over-ceiling text
    });

    it('existing indentation beyond 10 spaces can still be reduced via Shift-Tab, 2 at a time', () => {
      const view = mountView('              paragraph', 0); // 14 spaces
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('            paragraph'); // 12
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('          paragraph'); // 10 (now at ceiling)
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('        paragraph'); // 8 (below ceiling, still works)
    });
  });

  describe('list: same 0 -> 10 progression, independent of any other item', () => {
    it.each([
      ['bullet -', '- item'],
      ['bullet *', '* item'],
      ['bullet +', '+ item'],
      ['ordered 1-digit', '1. item'],
      ['ordered 2-digit', '10. item'],
      ['ordered 3-digit', '100. item'],
      ['task unchecked', '- [ ] item'],
      ['task checked', '- [x] item'],
    ])('%s: Tab progression 0,2,4,6,8,10', (_label, doc) => {
      const view = mountView(doc, 0);
      const markerText = doc; // marker text is a fixed suffix on every line
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 5; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        markerText,
        `  ${markerText}`,
        `    ${markerText}`,
        `      ${markerText}`,
        `        ${markerText}`,
        `          ${markerText}`,
      ]);
    });

    it('bullet: Tab at 10 spaces is a no-op', () => {
      const view = mountView('          - item', 0);
      const before = view.state.doc.toString();
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(before);
    });

    it('bullet: Shift-Tab progression 10 -> 0', () => {
      const view = mountView('          - item', 0);
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 5; i++) {
        expect(shiftTab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '          - item',
        '        - item',
        '      - item',
        '    - item',
        '  - item',
        '- item',
      ]);
    });

    it('a deeply indented PRECEDING item never influences the CURRENT item\'s own Tab amount', () => {
      const doc = '        - Item 1\n- Item 2';
      const view = mountView(doc, doc.indexOf('Item 2'));
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('        - Item 1\n  - Item 2');
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('        - Item 1\n    - Item 2');
      // Item 1's own indentation is untouched throughout.
    });

    it('caret at different positions inside the item all indent the same item identically', () => {
      const doc = '- This is my list item';
      const positions = {
        start: 0,
        midWord: doc.indexOf('This') + 2, // between "Th" and "is"
        end: doc.length,
      };
      for (const [label, pos] of Object.entries(positions)) {
        const view = mountView(doc, pos);
        expect(tab(view), `caret at ${label}`).toBe(true);
        expect(view.state.doc.toString(), `caret at ${label}`).toBe(`  ${doc}`);
      }
    });

    describe('Tab is independent of caret column — the locked-down matrix', () => {
      /**
       * Every position below must produce the exact same document
       * transformation for the exact same starting line — the caret's
       * horizontal position must never determine where indentation is
       * inserted (always `[line.from, markerFrom)`, never at the caret).
       * Covers, by name, every position named in the locked interaction
       * rule: before the marker, immediately after the marker,
       * after the marker's separator, inside content, and at end of
       * content — plus the case that most directly exercises "before
       * the marker" when the line already has leading whitespace of its
       * own, not just column 0 on a flush line.
       */
      const doc = '- Text';
      // '-' at 0, ' ' at 1, 'T' at 2, … 'Text' ends at 6 (doc.length)
      const caretPositions: Record<string, number> = {
        beforeMarker: 0,
        immediatelyAfterMarker: 1, // between '-' and the separator space
        afterMarkerSeparator: 2, // right at 'T', i.e. right after "- "
        insideContent: 4, // between "Te" and "xt"
        endOfContent: doc.length,
      };

      it.each(Object.entries(caretPositions))(
        'Tab: caret %s produces the identical "  - Text" regardless of column',
        (_label, pos) => {
          const view = mountView(doc, pos);
          expect(tab(view)).toBe(true);
          expect(view.state.doc.toString()).toBe('  - Text');
        }
      );

      it('caret strictly before existing leading whitespace ("  |- Text" with caret at column 0) still indents from the marker\'s own position, not the caret', () => {
        const indented = '  - Text'; // 2 leading spaces already present
        const view = mountView(indented, 0); // caret at the very start, before the 2 spaces
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('    - Text'); // 4 leading spaces
      });

      it('Shift-Tab is equally caret-independent across the same five positions', () => {
        const indented = '    - Text'; // 4 leading spaces, so Shift-Tab has room to remove
        for (const pos of Object.values(caretPositions).map((p) => p + 4)) {
          const view = mountView(indented, pos);
          expect(shiftTab(view)).toBe(true);
          expect(view.state.doc.toString()).toBe('  - Text');
        }
      });
    });

    it('no preceding sibling required: a lone item indents independently, level by level', () => {
      const view = mountView('- Only item', 0);
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 3; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '- Only item',
        '  - Only item',
        '    - Only item',
        '      - Only item',
      ]);
    });
  });

  describe('scope: constructs this milestone does not touch fall through unchanged', () => {
    it('heading: declines (returns false), letting the existing generic binding handle it', () => {
      const view = mountView('# Heading', 0);
      expect(tab(view)).toBe(false);
      expect(view.state.doc.toString()).toBe('# Heading');
    });

    it('blockquote: declines (returns false)', () => {
      const view = mountView('> Quote', 0);
      expect(tab(view)).toBe(false);
      expect(view.state.doc.toString()).toBe('> Quote');
    });

    it('fenced code content: declines (returns false)', () => {
      const view = mountView('```\ncode\n```', 5); // inside "code"
      expect(tab(view)).toBe(false);
      expect(view.state.doc.toString()).toBe('```\ncode\n```');
    });
  });
});
