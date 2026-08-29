// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { history, redo, undo } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterCommand } from '../enter/markdownEnterKeymap';
import { markdownIndentLess, markdownIndentMore } from './markdownIndentKeymap';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountView(doc: string, cursor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: Math.min(cursor, doc.length) },
    extensions: [markdownLanguageExtension()],
  });
  const view = new EditorView({ state, parent });
  mountedViews.push(view);
  return view;
}

function mountViewWithSelection(doc: string, ranges: Array<[number, number]>): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.create(ranges.map(([from, to]) => EditorSelection.range(from, to))),
    extensions: [markdownLanguageExtension()],
  });
  const view = new EditorView({ state, parent });
  mountedViews.push(view);
  return view;
}

function tab(view: EditorView): boolean {
  return markdownIndentMore({ state: view.state, dispatch: (tr) => view.update([tr]) });
}

function shiftTab(view: EditorView): boolean {
  return markdownIndentLess({ state: view.state, dispatch: (tr) => view.update([tr]) });
}

function pressEnter(view: EditorView): boolean {
  return markdownEnterCommand({ state: view.state, dispatch: (tr) => view.update([tr]) });
}

function pressUndo(view: EditorView): boolean {
  return undo({ state: view.state, dispatch: (tr) => view.update([tr]) });
}

function pressRedo(view: EditorView): boolean {
  return redo({ state: view.state, dispatch: (tr) => view.update([tr]) });
}

/** Names of every `ListItem`'s immediate `BulletList`/`OrderedList` parent, in document order — a cheap way to assert sibling-vs-nested shape without hand-walking the tree in every test. */
function listNestingDepths(view: EditorView): number[] {
  const depths: number[] = [];
  syntaxTree(view.state).iterate({
    enter: (node) => {
      if (node.name !== 'ListItem') return;
      let depth = 0;
      for (let p = node.node.parent; p; p = p.parent) {
        if (p.name === 'ListItem') depth++;
      }
      depths.push(depth);
    },
  });
  return depths;
}

describe('markdownIndentKeymap', () => {
  describe('paragraph: Tab caps at 5 levels (10 spaces), Shift-Tab floors at 0', () => {
    it('Tab progression 0,2,4,6,8,10, then plateaus at the 5-level ceiling', () => {
      const view = mountView('paragraph', 0);
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 7; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        'paragraph',
        '  paragraph',
        '    paragraph',
        '      paragraph',
        '        paragraph',
        '          paragraph', // 10 spaces = 5 levels, the ceiling
        '          paragraph', // plateau: Tab #6 is a handled no-op
        '          paragraph', // plateau: Tab #7 is a handled no-op
      ]);
    });

    it('a line already past the ceiling (pasted/typed, not reached via Tab) is never shrunk by Tab — only prevented from growing', () => {
      const view = mountView(`${' '.repeat(14)}paragraph`, 0); // 14 spaces, already past the 10-space ceiling
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(`${' '.repeat(14)}paragraph`); // unchanged, not clamped down to 10
    });

    it('Shift-Tab progression 10 -> 0, then floors', () => {
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
      // Floor holds: one more Shift-Tab is still handled, still a no-op.
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('paragraph');
    });

    it('Shift-Tab at 0 spaces is a no-op', () => {
      const view = mountView('paragraph', 0);
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('paragraph');
    });

    it('deeply indented text (past the ceiling) can still be reduced via Shift-Tab, uncapped on the way down', () => {
      const view = mountView('              paragraph', 0); // 14 spaces
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('            paragraph'); // 12
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('          paragraph'); // 10
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('        paragraph'); // 8 — dedent has no ceiling-related special-casing
    });
  });

  describe('list: Tab caps at 5 levels, independent of any other item', () => {
    it.each([
      ['bullet -', '- item'],
      ['bullet *', '* item'],
      ['bullet +', '+ item'],
      ['ordered 1-digit', '1. item'],
      ['ordered 2-digit', '10. item'],
      ['ordered 3-digit', '100. item'],
      ['task unchecked', '- [ ] item'],
      ['task checked', '- [x] item'],
    ])('%s: Tab progression 0,2,4,6,8,10, then plateaus at the 5-level ceiling', (_label, doc) => {
      const view = mountView(doc, 0);
      const markerText = doc; // marker text is a fixed suffix on every line
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 7; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        markerText,
        `  ${markerText}`,
        `    ${markerText}`,
        `      ${markerText}`,
        `        ${markerText}`,
        `          ${markerText}`, // 10 spaces = 5 levels, the ceiling
        `          ${markerText}`, // plateau
        `          ${markerText}`, // plateau
      ]);
    });

    it('bullet: Tab plateaus at the 5-level ceiling — already at 10 spaces, further presses are no-ops', () => {
      const view = mountView('          - item', 0); // 10 spaces = 5 levels, already at the ceiling
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 4; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '          - item',
        '          - item',
        '          - item',
        '          - item',
        '          - item',
      ]);
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

  /**
   * Locked architectural invariant (do not reintroduce a subtree/hierarchy
   * algorithm under any name): Tab/Shift-Tab modify only the physical
   * line(s) explicitly covered by the user's cursor or selection. They
   * never discover a parent to establish a logical level, never discover
   * or move descendants, and never require or repair a parent/child
   * relationship. Whatever list hierarchy results is whatever Lezer
   * derives from the edited source on its next reparse — not something
   * this command tracks or protects. These tests are the permanent
   * regression guard for the `subtreeShiftChanges()` behavior that was
   * built, found to silently rewrite sibling/descendant source lines, and
   * reverted.
   */
  describe('source-local invariant: Tab/Shift-Tab never touch a line the user did not select', () => {
    it('Case A — Tab on Parent only: Child line is byte-for-byte unchanged', () => {
      const doc = '- Parent\n  - Child';
      const view = mountView(doc, doc.indexOf('Parent'));
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('  - Parent\n  - Child');

      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('  - Parent'); // exactly one INDENT_STEP_SPACES more
      expect(lines[1]).toBe('  - Child'); // untouched — still the original text

      // The resulting tree is whatever CommonMark says for these columns:
      // Parent and Child are now siblings in the same list, not nested.
      // This is the accepted consequence of Model A, not a bug to "fix".
      expect(listNestingDepths(view)).toEqual([0, 0]);
    });

    it('Case B — Tab on Parent repeatedly, with Child + Grandchild: only Parent ever changes', () => {
      const doc = '- Parent\n  - Child\n    - Grandchild';
      const view = mountView(doc, doc.indexOf('Parent'));

      for (let i = 0; i < 4; i++) {
        expect(tab(view)).toBe(true);
        const lines = view.state.doc.toString().split('\n');
        expect(lines[1]).toBe('  - Child'); // unchanged every single press
        expect(lines[2]).toBe('    - Grandchild'); // unchanged every single press
      }

      const finalLines = view.state.doc.toString().split('\n');
      expect(finalLines[0]).toBe(`${' '.repeat(2 * 4)}- Parent`);
    });

    it('Case C — the exact previously-reverted bug scenario: Tab on Item 1 must never touch Item 2', () => {
      const doc = '      - Item 1\n          - Item 2';
      const view = mountView(doc, doc.indexOf('Item 1'));

      const item2Before = view.state.doc.toString().split('\n')[1];
      expect(tab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');

      expect(lines[0]).toBe('        - Item 1'); // Item 1 grew by 2
      expect(lines[1]).toBe(item2Before); // Item 2 byte-for-byte unchanged
      expect(lines[1]).toBe('          - Item 2');
    });

    it('Case C, mirrored — Shift-Tab on Item 1 must never touch Item 2 either', () => {
      const doc = '      - Item 1\n          - Item 2';
      const view = mountView(doc, doc.indexOf('Item 1'));

      const item2Before = view.state.doc.toString().split('\n')[1];
      expect(shiftTab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');

      expect(lines[0]).toBe('    - Item 1'); // Item 1 shrank by 2
      expect(lines[1]).toBe(item2Before); // Item 2 byte-for-byte unchanged
    });
  });

  describe('no-parent deep indentation: an isolated bullet with no structural parent anywhere', () => {
    it('Tab repeatedly on an isolated deeply-indented bullet — no parent required, plateaus at the 5-level ceiling', () => {
      const view = mountView('        - Item', 0); // 8 leading spaces, no other line in the document
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 4; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '        - Item',
        '          - Item', // 10 spaces = 5 levels, the ceiling
        '          - Item', // plateau
        '          - Item', // plateau
        '          - Item', // plateau
      ]);
    });

    it('after each Tab, the line still parses as a valid, independently-addressable ListItem (reparsed, not assumed)', () => {
      const view = mountView('        - Item', 0);
      for (let i = 0; i < 4; i++) {
        expect(tab(view)).toBe(true);
        const tree = syntaxTree(view.state);
        let sawListItem = false;
        tree.iterate({
          enter: (node) => {
            if (node.name === 'ListItem') sawListItem = true;
          },
        });
        expect(sawListItem, `after Tab #${i + 1}`).toBe(true);
      }
    });
  });

  describe('siblings: Tab on one sibling never touches the others', () => {
    it('- A / - B / - C, Tab on B only: A and C are byte-for-byte unchanged', () => {
      const doc = '- A\n- B\n- C';
      const view = mountView(doc, doc.indexOf('B'));
      expect(tab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('- A');
      expect(lines[1]).toBe('  - B');
      expect(lines[2]).toBe('- C');

      // Resulting parser hierarchy: B is now nested under A; C remains a
      // top-level sibling of A — a consequence of the columns, not
      // something this command decided.
      expect(listNestingDepths(view)).toEqual([0, 1, 0]);
    });
  });

  describe('multi-line selection: every explicitly-selected line is indented — this is NOT subtree movement', () => {
    it('selection spanning Parent + Child indents both, because both are explicitly selected', () => {
      const doc = '- Parent\n  - Child';
      const view = mountViewWithSelection(doc, [[0, doc.length]]);
      expect(tab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('  - Parent');
      expect(lines[1]).toBe('    - Child');
    });

    it('selection touching a list line and a blockquote line indents both uniformly — no construct distinction', () => {
      const doc = '- Item\n> Quote';
      const view = mountViewWithSelection(doc, [[0, doc.length]]);
      expect(tab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('  - Item');
      expect(lines[1]).toBe('  > Quote'); // touched exactly like every other selected line
    });

    it('selection boundaries exactly at line starts/ends still cover both lines', () => {
      const doc = '- A\n- B';
      const view = mountViewWithSelection(doc, [[0, doc.length]]);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('  - A\n  - B');
    });

    // Note: this editor does not enable CM6's `allowMultipleSelections`
    // facet, so multiple simultaneous cursor/selection ranges are not
    // real infrastructure here — `EditorState` silently collapses to the
    // primary range without it. Nothing to test for that case until/unless
    // the editor opts into multiple selections elsewhere.
  });

  describe('Tab -> Enter: Enter reads the tree Tab produced, with no Enter-specific changes needed', () => {
    it('Tab on Parent, then Enter at end of Parent: new sibling line appears at the post-Tab column', () => {
      const doc = '- Parent\n  - Child';
      const view = mountView(doc, doc.indexOf('Parent') + 'Parent'.length);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('  - Parent\n  - Child');

      expect(pressEnter(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');
      // Enter re-derives its own indentation from the CURRENT tree
      // (Parent now at column 2) — no special-casing required here.
      expect(lines[1]).toBe('  - '); // fresh sibling item at Parent's new column
      expect(lines[2]).toBe('  - Child'); // still untouched
    });
  });

  describe('undo/redo: each Tab press is exactly one transaction (real CM6 history, no custom history code)', () => {
    function mountViewWithHistory(doc: string, cursor: number): EditorView {
      const parent = document.createElement('div');
      document.body.appendChild(parent);
      const state = EditorState.create({
        doc,
        selection: { anchor: Math.min(cursor, doc.length) },
        extensions: [markdownLanguageExtension(), history()],
      });
      const view = new EditorView({ state, parent });
      mountedViews.push(view);
      return view;
    }

    it('three Tabs then three Undos restores the original text progressively, and Redo replays each step', () => {
      const view = mountViewWithHistory('- Item', 0);
      const states: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 3; i++) {
        expect(tab(view)).toBe(true);
        states.push(view.state.doc.toString());
      }
      expect(states).toEqual(['- Item', '  - Item', '    - Item', '      - Item']);

      for (let i = states.length - 1; i > 0; i--) {
        expect(pressUndo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(states[i - 1]);
      }
      // Fully undone — one more Undo has nothing left to do.
      expect(pressUndo(view)).toBe(false);

      for (let i = 1; i < states.length; i++) {
        expect(pressRedo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(states[i]);
      }
    });
  });

  describe('no construct distinction: every line is touched uniformly, matching plain CM6 indentMore/indentLess', () => {
    // Simplified 2026-08-29: this keymap no longer inspects the syntax tree
    // at all, so it no longer "declines" for any construct — every
    // touched line gets the same treatment, exactly like native CM6.

    it('heading: indented like any other line', () => {
      const view = mountView('# Heading', 0);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('  # Heading');
    });

    it('blockquote: indented like any other line', () => {
      const view = mountView('> Quote', 0);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('  > Quote');
    });

    it('fenced code content: indented like any other line', () => {
      const view = mountView('```\ncode\n```', 5); // inside "code"
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('```\n  code\n```');
    });

    it('a genuinely blank line in the selection is indented too, matching native CM6', () => {
      const view = mountViewWithSelection('- one\n\n- two', [[0, 12]]);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('  - one\n  \n  - two');
    });

    it('Shift-Tab at 0 spaces on any construct is still a handled no-op (never declines)', () => {
      const view = mountView('# Heading', 0);
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('# Heading');
    });
  });

  describe('5-level indent ceiling (added 2026-08-29)', () => {
    it('applies uniformly across constructs — heading also plateaus at 10 spaces', () => {
      const view = mountView('# Heading', 0);
      for (let i = 0; i < 5; i++) {
        expect(tab(view)).toBe(true);
      }
      expect(view.state.doc.toString()).toBe('          # Heading'); // 10 spaces
      expect(tab(view)).toBe(true); // 6th press: at the ceiling, no-op
      expect(view.state.doc.toString()).toBe('          # Heading');
    });

    it('a multi-line selection: lines already at the ceiling stay put while a shallower line in the same selection still grows', () => {
      const doc = '          - one\n- two'; // "one" already at 10 spaces, "two" at 0
      const view = mountViewWithSelection(doc, [[0, doc.length]]);
      expect(tab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('          - one'); // unchanged — already at the ceiling
      expect(lines[1]).toBe('  - two'); // grew normally
    });

    it('Shift-Tab is completely unaffected by the ceiling — dedents past it freely', () => {
      const view = mountView(`${' '.repeat(16)}- deep`, 0); // 16 spaces, well past the 10-space ceiling
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(`${' '.repeat(14)}- deep`);
    });
  });
});
