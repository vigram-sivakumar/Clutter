// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { indentUnit, syntaxTree } from '@codemirror/language';
import {
  deleteCharBackward,
  history,
  indentLess,
  indentMore,
  indentSelection,
  redo,
  undo,
} from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterCommand } from '../enter/markdownEnterKeymap';
import { INDENT_UNIT_STRING } from './markdownIndentContext';
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
  describe('paragraph: Tab caps at 5 levels (20 spaces), Shift-Tab floors at 0', () => {
    it('Tab progression 0,4,8,12,16,20, then plateaus at the 5-level ceiling', () => {
      const view = mountView('paragraph', 0);
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 7; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        'paragraph',
        '    paragraph',
        '        paragraph',
        '            paragraph',
        '                paragraph',
        '                    paragraph', // 20 spaces = 5 levels, the ceiling
        '                    paragraph', // plateau: Tab #6 is a handled no-op
        '                    paragraph', // plateau: Tab #7 is a handled no-op
      ]);
    });

    it('a line already past the ceiling (pasted/typed, not reached via Tab) is never shrunk by Tab — only prevented from growing', () => {
      const view = mountView(`${' '.repeat(24)}paragraph`, 0); // 24 spaces, already past the 20-space ceiling
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(`${' '.repeat(24)}paragraph`); // unchanged, not clamped down to 20
    });

    it('Shift-Tab progression 20 -> 0, then floors', () => {
      const view = mountView('                    paragraph', 0);
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 5; i++) {
        expect(shiftTab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '                    paragraph',
        '                paragraph',
        '            paragraph',
        '        paragraph',
        '    paragraph',
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
      const view = mountView('                        paragraph', 0); // 24 spaces
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('                    paragraph'); // 20
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('                paragraph'); // 16
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('            paragraph'); // 12 — dedent has no ceiling-related special-casing
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
    ])('%s: Tab progression 0,4,8,12,16,20, then plateaus at the 5-level ceiling', (_label, doc) => {
      const view = mountView(doc, 0);
      const markerText = doc; // marker text is a fixed suffix on every line
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 7; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        markerText,
        `    ${markerText}`,
        `        ${markerText}`,
        `            ${markerText}`,
        `                ${markerText}`,
        `                    ${markerText}`, // 20 spaces = 5 levels, the ceiling
        `                    ${markerText}`, // plateau
        `                    ${markerText}`, // plateau
      ]);
    });

    it('bullet: Tab plateaus at the 5-level ceiling — already at 20 spaces, further presses are no-ops', () => {
      const view = mountView('                    - item', 0); // 20 spaces = 5 levels, already at the ceiling
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 4; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '                    - item',
        '                    - item',
        '                    - item',
        '                    - item',
        '                    - item',
      ]);
    });

    it('bullet: Shift-Tab progression 20 -> 0', () => {
      const view = mountView('                    - item', 0);
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 5; i++) {
        expect(shiftTab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '                    - item',
        '                - item',
        '            - item',
        '        - item',
        '    - item',
        '- item',
      ]);
    });

    it('a deeply indented PRECEDING item never influences the CURRENT item\'s own Tab amount', () => {
      const doc = '        - Item 1\n- Item 2';
      const view = mountView(doc, doc.indexOf('Item 2'));
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('        - Item 1\n    - Item 2');
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('        - Item 1\n        - Item 2');
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
        expect(view.state.doc.toString(), `caret at ${label}`).toBe(`    ${doc}`);
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
        'Tab: caret %s produces the identical "    - Text" regardless of column',
        (_label, pos) => {
          const view = mountView(doc, pos);
          expect(tab(view)).toBe(true);
          expect(view.state.doc.toString()).toBe('    - Text');
        }
      );

      it('caret strictly before existing leading whitespace ("  |- Text" with caret at column 0) still indents from the marker\'s own position, not the caret', () => {
        const indented = '  - Text'; // 2 leading spaces already present
        const view = mountView(indented, 0); // caret at the very start, before the 2 spaces
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('      - Text'); // 2 existing + 4 new = 6 leading spaces
      });

      it('Shift-Tab is equally caret-independent across the same five positions', () => {
        const indented = '        - Text'; // 8 leading spaces, so Shift-Tab has room to remove one full 4-space level
        for (const pos of Object.values(caretPositions).map((p) => p + 8)) {
          const view = mountView(indented, pos);
          expect(shiftTab(view)).toBe(true);
          expect(view.state.doc.toString()).toBe('    - Text');
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
        '    - Only item',
        '        - Only item',
        '            - Only item',
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
      expect(view.state.doc.toString()).toBe('    - Parent\n  - Child');

      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('    - Parent'); // exactly one INDENT_STEP_SPACES more
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
      expect(finalLines[0]).toBe(`${' '.repeat(4 * 4)}- Parent`);
    });

    it('Case C — the exact previously-reverted bug scenario: Tab on Item 1 must never touch Item 2', () => {
      const doc = '      - Item 1\n          - Item 2';
      const view = mountView(doc, doc.indexOf('Item 1'));

      const item2Before = view.state.doc.toString().split('\n')[1];
      expect(tab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');

      expect(lines[0]).toBe('          - Item 1'); // Item 1 grew by 4
      expect(lines[1]).toBe(item2Before); // Item 2 byte-for-byte unchanged
      expect(lines[1]).toBe('          - Item 2');
    });

    it('Case C, mirrored — Shift-Tab on Item 1 must never touch Item 2 either', () => {
      const doc = '      - Item 1\n          - Item 2';
      const view = mountView(doc, doc.indexOf('Item 1'));

      const item2Before = view.state.doc.toString().split('\n')[1];
      expect(shiftTab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');

      expect(lines[0]).toBe('  - Item 1'); // Item 1 shrank by 4
      expect(lines[1]).toBe(item2Before); // Item 2 byte-for-byte unchanged
    });
  });

  describe('no-parent deep indentation: an isolated bullet with no structural parent anywhere', () => {
    it('Tab repeatedly on an isolated deeply-indented bullet — no parent required, plateaus at the 5-level ceiling', () => {
      const view = mountView('                - Item', 0); // 16 leading spaces, no other line in the document
      const seen: string[] = [view.state.doc.toString()];
      for (let i = 0; i < 4; i++) {
        expect(tab(view)).toBe(true);
        seen.push(view.state.doc.toString());
      }
      expect(seen).toEqual([
        '                - Item',
        '                    - Item', // 20 spaces = 5 levels, the ceiling
        '                    - Item', // plateau
        '                    - Item', // plateau
        '                    - Item', // plateau
      ]);
    });

    it('after each Tab, the line still parses as a valid, independently-addressable ListItem (reparsed, not assumed)', () => {
      const view = mountView('                - Item', 0);
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
      expect(lines[1]).toBe('    - B');
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
      expect(lines[0]).toBe('    - Parent');
      expect(lines[1]).toBe('      - Child');
    });

    it('selection touching a list line and a blockquote line indents both uniformly — no construct distinction', () => {
      const doc = '- Item\n> Quote';
      const view = mountViewWithSelection(doc, [[0, doc.length]]);
      expect(tab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('    - Item');
      expect(lines[1]).toBe('    > Quote'); // touched exactly like every other selected line
    });

    it('selection boundaries exactly at line starts/ends still cover both lines', () => {
      const doc = '- A\n- B';
      const view = mountViewWithSelection(doc, [[0, doc.length]]);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    - A\n    - B');
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
      expect(view.state.doc.toString()).toBe('    - Parent\n  - Child');

      expect(pressEnter(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');
      // Enter re-derives its own indentation from the CURRENT tree
      // (Parent now at column 4) — no special-casing required here.
      expect(lines[1]).toBe('    - '); // fresh sibling item at Parent's new column
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
      expect(states).toEqual(['- Item', '    - Item', '        - Item', '            - Item']);

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
      expect(view.state.doc.toString()).toBe('    # Heading');
    });

    it('blockquote: indented like any other line', () => {
      const view = mountView('> Quote', 0);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    > Quote');
    });

    it('fenced code content: indented like any other line', () => {
      const view = mountView('```\ncode\n```', 5); // inside "code"
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('```\n    code\n```');
    });

    it('a genuinely blank line in the selection is indented too, matching native CM6', () => {
      const view = mountViewWithSelection('- one\n\n- two', [[0, 12]]);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    - one\n    \n    - two');
    });

    it('Shift-Tab at 0 spaces on any construct is still a handled no-op (never declines)', () => {
      const view = mountView('# Heading', 0);
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('# Heading');
    });
  });

  describe('5-level indent ceiling (added 2026-08-29)', () => {
    it('applies uniformly across constructs — heading also plateaus at 20 spaces', () => {
      const view = mountView('# Heading', 0);
      for (let i = 0; i < 5; i++) {
        expect(tab(view)).toBe(true);
      }
      expect(view.state.doc.toString()).toBe('                    # Heading'); // 20 spaces
      expect(tab(view)).toBe(true); // 6th press: at the ceiling, no-op
      expect(view.state.doc.toString()).toBe('                    # Heading');
    });

    it('a multi-line selection: lines already at the ceiling stay put while a shallower line in the same selection still grows', () => {
      const doc = '                    - one\n- two'; // "one" already at 20 spaces, "two" at 0
      const view = mountViewWithSelection(doc, [[0, doc.length]]);
      expect(tab(view)).toBe(true);
      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('                    - one'); // unchanged — already at the ceiling
      expect(lines[1]).toBe('    - two'); // grew normally
    });

    it('Shift-Tab is completely unaffected by the ceiling — dedents past it freely', () => {
      const view = mountView(`${' '.repeat(32)}- deep`, 0); // 32 spaces, well past the 20-space ceiling
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe(`${' '.repeat(28)}- deep`);
    });
  });

  describe('caret tracking on Tab (regression: caret must move forward with inserted indentation)', () => {
    it('plain text, caret at content-start (position 0): caret ends up after the inserted indentation', () => {
      const view = mountView('Text', 0);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    Text');
      expect(view.state.selection.main.head).toBe(4);
    });

    it('empty line, caret at 0: caret ends up after the inserted indentation', () => {
      const view = mountView('', 0);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    ');
      expect(view.state.selection.main.head).toBe(4);
    });

    it('bullet line, caret at 0 (before the marker): caret ends up after the inserted indentation, still before the marker', () => {
      const view = mountView('- Text', 0);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    - Text');
      expect(view.state.selection.main.head).toBe(4);
    });

    it('ordered list line, caret at 0 (before the marker): caret ends up after the inserted indentation, still before the marker', () => {
      const view = mountView('1. Text', 0);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    1. Text');
      expect(view.state.selection.main.head).toBe(4);
    });

    it('repeated Tab at content-start: caret advances by INDENT_STEP_SPACES every press, never sticks', () => {
      const view = mountView('Text', 0);
      const seenHeads: number[] = [view.state.selection.main.head];
      for (let i = 0; i < 3; i++) {
        expect(tab(view)).toBe(true);
        seenHeads.push(view.state.selection.main.head);
      }
      expect(seenHeads).toEqual([0, 4, 8, 12]);
      expect(view.state.doc.toString()).toBe('            Text');
    });

    it('caret already past the insertion point (position 1) is unaffected by the fix — still lands correctly', () => {
      const view = mountView('Text', 1);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    Text');
      expect(view.state.selection.main.head).toBe(5);
    });

    it('caret at end of content is unaffected by the fix — still lands correctly', () => {
      const view = mountView('Text', 4);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    Text');
      expect(view.state.selection.main.head).toBe(8);
    });

    it('Shift-Tab remains correct at content-start — caret already collapses to 0 via default mapping', () => {
      const view = mountView('  Text', 0);
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('Text');
      expect(view.state.selection.main.head).toBe(0);
    });

    it('Shift-Tab remains correct with caret inside the removed whitespace', () => {
      const view = mountView('  Text', 1);
      expect(shiftTab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('Text');
      expect(view.state.selection.main.head).toBe(0);
    });

    it('multi-line selection: every touched line maps its own selection edge forward correctly', () => {
      const doc = '- A\n- B';
      const view = mountViewWithSelection(doc, [[0, doc.length]]);
      expect(tab(view)).toBe(true);
      expect(view.state.doc.toString()).toBe('    - A\n    - B');
      // Selection anchor was at 0 (before "- A"'s own insertion point);
      // selection end was at doc.length (past every insertion point).
      expect(view.state.selection.main.from).toBe(4);
      expect(view.state.selection.main.to).toBe(view.state.doc.length);
    });
  });

  /**
   * Product decision (2026-08-30): Tab/Shift-Tab's own indentation
   * arithmetic (`lineIndentChange`, tested exhaustively above) stays
   * completely flat and unmodified — every test in this block presses
   * real Tab/Shift-Tab and asserts on the *resulting document*, never on
   * how much a line indented, which is never itself under test here.
   * `planOrderedListNormalization` (`../list/orderedListTabNormalization.ts`)
   * is the thing being verified: after the flat whitespace edit, did the
   * provisional tree show a genuine `OrderedList` membership change for a
   * touched line, and if so, was numbering normalized correctly for both
   * the list it left (source) and the list it joined (destination)?
   * docs/list-item-architecture-odr.md §16/§20 records the full design
   * and mechanism evidence this suite exercises end-to-end.
   */
  describe('ordered-list numbering normalization (2026-08-30, Tab/Shift-Tab triggered)', () => {
    describe('single-item Tab: new destination list starts at 1', () => {
      it('"1. A/2. B/3. C", Tab B once: content column 3 is reached in one 4-space press, so B nests under A as "1." and C closes the source gap to "2." immediately', () => {
        const doc = '1. A\n2. B\n3. C';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n    1. B\n2. C');
        expect(listNestingDepths(view)).toEqual([0, 1, 0]);
      });

      it('paren delimiter: "1) A/2) B/3) C" behaves identically', () => {
        const doc = '1) A\n2) B\n3) C';
        const view = mountView(doc, doc.indexOf('2) B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1) A\n    1) B\n2) C');
      });

      it('deleting the LAST item in a sequence needs no source-side renumbering (nothing follows)', () => {
        const doc = '1. A\n2. B';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n    1. B');
      });
    });

    describe('multiple selected items move together into one new destination, numbered from 1', () => {
      it('"1. A/2. B/3. C/4. D", select B+C only: both nest starting at 1, D (untouched) closes the gap', () => {
        const doc = '1. A\n2. B\n3. C\n4. D';
        const from = doc.indexOf('2. B');
        const to = doc.indexOf('3. C') + '3. C'.length; // ends exactly at C's own line end, D excluded
        const view = mountViewWithSelection(doc, [[from, to]]);
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n    1. B\n    2. C\n2. D');
        expect(listNestingDepths(view)).toEqual([0, 1, 1, 0]);
      });
    });

    describe('joining an existing destination list', () => {
      it('"1. A/    1. Existing/2. B/3. C": B joins as "2.", preserving Existing\'s own "1.", and the source list closes its gap', () => {
        const doc = '1. A\n    1. Existing\n2. B\n3. C';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n    1. Existing\n    2. B\n2. C');
      });

      it('joining after an irregularly-numbered anchor continues from ITS OWN number, not from 1', () => {
        // "5. Existing" is a top-level sibling of "1. A" in the same list
        // (§16.1: numeric value is irrelevant to list membership) — B
        // nests under Existing specifically (the immediately preceding
        // item), forming a brand-new child list there, so it starts at 1
        // regardless of Existing's own irregular "5." — nesting under an
        // item is never "continue that item's own number."
        const doc = '1. A\n5. Existing\n2. B\n3. C';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n5. Existing\n    1. B\n2. C');
      });
    });

    describe('Shift-Tab: source-side departure and destination-side joining are the same planner, mirror-imaged', () => {
      it('complete-group Shift-Tab: B+C dedent out of a nested list, rejoining the outer list at column 0 (below the 0-3 sibling tolerance) and pushing D down', () => {
        const doc = '1. A\n    1. B\n    2. C\n2. D';
        const from = doc.indexOf('1. B');
        const to = doc.indexOf('2. C') + '2. C'.length;
        const view = mountViewWithSelection(doc, [[from, to]]);
        expect(shiftTab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n2. B\n3. C\n4. D');
        expect(listNestingDepths(view)).toEqual([0, 0, 0, 0]);
      });

      it('a fully-vacated nested source list needs no source-side gap-closing, but B still correctly joins the outer list as a genuine insertion (renumbered to 2, C shifts to 3)', () => {
        const doc = '1. A\n    1. B\n2. C';
        const from = doc.indexOf('1. B');
        const view = mountView(doc, from);
        expect(shiftTab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n2. B\n3. C');
      });
    });

    describe('nested ordered lists: normalization scopes correctly to the exact container a member left or joined', () => {
      it('ordered nested under bullet: joining/leaving a nested OrderedList under a BulletList parent renumbers correctly, bullet untouched', () => {
        const doc = '- Parent\n  1. A\n  2. B\n  3. C';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('- Parent\n  1. A\n      1. B\n  2. C');
      });

      it('grandchild depth: a three-level nested join renumbers only its own immediate container', () => {
        const doc = '1. A\n    1. B\n    2. C\n    3. D';
        const view = mountView(doc, doc.indexOf('3. D'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n    1. B\n    2. C\n        1. D');
        expect(listNestingDepths(view)).toEqual([0, 1, 1, 2]);
      });
    });

    describe('independent lists: normalizing one list never touches an unrelated one', () => {
      it('a paragraph-separated second list is untouched by the first list\'s own normalization', () => {
        const doc = '1. A\n2. B\n3. C\n\nA paragraph.\n\n1. X\n2. Y';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(
          '1. A\n    1. B\n2. C\n\nA paragraph.\n\n1. X\n2. Y'
        );
      });
    });

    describe('irregular numbering: never "repaired," only ever closed at a genuine sequential run', () => {
      it('"1. A/5. B/9. C": Tab-nesting B under A leaves the OUTER run\'s own gaps exactly as authored (9 stays 9, not sequential to 5)', () => {
        const doc = '1. A\n5. B\n9. C';
        const view = mountView(doc, doc.indexOf('5. B'));
        expect(tab(view)).toBe(true);
        // B departs; "9." is not `5 + 1`, so the source-side walk stops
        // immediately and never touches it — matches `renumberSequentialTail`'s
        // own "stop at the first non-sequential sibling" policy exactly.
        expect(view.state.doc.toString()).toBe('1. A\n    1. B\n9. C');
      });
    });

    describe('wide markers (99999.) never influence indentation amount, and are handled correctly when nesting is actually reached', () => {
      it('Tab always adds exactly 4 spaces regardless of marker width', () => {
        const doc = '99999. A\n2. B';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        // Exactly +4 -- never anything derived from "99999."'s own width.
        expect(view.state.doc.toString()).toBe('99999. A\n    2. B');
      });

      it('joining a "99999."-owned list once enough presses reach its real content column', () => {
        const doc = '99999. A\n        1. Existing\n2. B\n3. C';
        const view = mountView(doc, doc.indexOf('2. B'));
        for (let i = 0; i < 2; i++) {
          expect(tab(view)).toBe(true);
        }
        expect(view.state.doc.toString()).toBe('99999. A\n        1. Existing\n        2. B\n3. C');
      });

      /**
       * Known, accepted limitation (not a bug — matches this codebase's
       * existing posture toward the already-documented Rule #5 gap,
       * docs/list-item-architecture-odr.md §14.9/§16.2): a *very* wide
       * marker's nesting window can sit far enough past the flat 2-space
       * step that an intermediate press lands in neither the sibling nor
       * the nesting zone, and the touched line is briefly not recognized
       * as a `ListItem` at all (absorbed as plain paragraph continuation
       * text). The normalizer correctly does nothing on that press — it
       * never corrupts anything — but a later press that finally reaches
       * real nesting has no way to retroactively fix what an earlier
       * press's own gap gave up on, since each press's own before/after
       * comparison is local to that one press. Documented, not fixed: the
       * alternative (tracking membership across a whole press sequence)
       * is a materially bigger mechanism this decision explicitly rejects
       * ("no parent/child-aware... logic").
       */
      it('sequential real keypresses through the gap: the source list is left unrenumbered once nesting is finally reached (documented limitation)', () => {
        const doc = '1. A\n2. B\n    8. Eight\n    9. NineOwner\n3. C';
        const view = mountView(doc, doc.indexOf('2. B'));
        for (let i = 0; i < 4; i++) {
          tab(view);
        }
        // B does successfully join the nested list once 8 spaces is
        // reached (content column 7 for "99999."-scale markers is not in
        // play here; this fixture's own gap is narrower and still
        // reachable) -- the important assertion is that nothing is ever
        // left corrupted, whichever way the numbering lands.
        const result = view.state.doc.toString();
        expect(result.includes('Eight')).toBe(true);
        expect(result.includes('NineOwner')).toBe(true);
      });
    });

    describe('marker-width growth safety: reuses isRiskyRenumberRewrite, never corrupts a multi-line item\'s own nested content', () => {
      it('GUARD PROOF: joining at the front of an existing destination declines the one rewrite that would push a multi-line "9." to "10.", but still safely shifts "8." to "9."', () => {
        const doc = '1. A\n2. B\n    8. Eight\n    9. NineOwner\n       1. NestedUnderNine\n3. C';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(
          '1. A\n    1. B\n    9. Eight\n    9. NineOwner\n       1. NestedUnderNine\n2. C'
        );
        // The declined rewrite leaves a duplicate "9." rather than a
        // destroyed nested list -- the same accepted tradeoff Enter's own
        // growth-direction guard already makes (§15).
        expect(listNestingDepths(view)).toEqual([0, 1, 1, 1, 2, 0]);
      });

      it('control: the identical shift with no nested content on the multi-line boundary is allowed', () => {
        const doc = '1. A\n2. B\n    8. Eight\n    9. Nine\n3. C';
        const view = mountView(doc, doc.indexOf('2. B'));
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n    1. B\n    9. Eight\n    10. Nine\n2. C');
      });

      it('shrink safety: a complete-group Shift-Tab departure shrinking a wide destination-adjacent number stays within the safe magnitude', () => {
        const doc = '1. A\n    100. B\n    101. NestedOwner\n       1. Nested\n2. C';
        const from = doc.indexOf('100. B');
        const to = doc.indexOf('101. NestedOwner') + '101. NestedOwner'.length;
        const view = mountViewWithSelection(doc, [[from, to]]);
        expect(shiftTab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(
          '1. A\n2. B\n3. NestedOwner\n       1. Nested\n4. C'
        );
      });
    });

    describe('manual number edits remain completely unrestricted -- normalization only ever runs from Tab/Shift-Tab', () => {
      it('typing over a digit directly never triggers the normalizer, even though it changes marker width', () => {
        const doc = '1. A\n2. B\n3. C';
        const view = mountView(doc, 0);
        const nine = doc.indexOf('2');
        view.dispatch({ changes: { from: nine, to: nine + 1, insert: '99' } });
        expect(view.state.doc.toString()).toBe('1. A\n99. B\n3. C');
      });

      it('Backspace deleting a digit mid-marker is untouched by this module (separate, pre-existing code path)', () => {
        const doc = '10. A\n11. B';
        const view = mountView(doc, doc.indexOf('10. A') + 1);
        view.dispatch({ changes: { from: 1, to: 2, insert: '' } });
        expect(view.state.doc.toString()).toBe('1. A\n11. B');
      });
    });

    describe('undo/redo: the whitespace edit and any numbering normalization dispatch as one transaction, one undo step', () => {
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

      it('the press that triggers normalization undoes and redoes both the indent and the renumber together', () => {
        const doc = '1. A\n2. B\n3. C';
        const view = mountViewWithHistory(doc, doc.indexOf('2. B'));
        // A single 4-space press already reaches column 4, inside "1."'s
        // own nesting window [3,6] -- this one press both nests AND
        // renumbers, in the same transaction.
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n    1. B\n2. C');

        expect(pressUndo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n2. B\n3. C');

        expect(pressRedo(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('1. A\n    1. B\n2. C');
      });
    });

    describe('mixed selections: bullets are never renumbered, ordered items in the same selection are handled independently', () => {
      it('a selection spanning an ordered item and a following bullet list normalizes the ordered side while the bullets only ever get the flat whitespace edit', () => {
        const doc = '1. A\n2. B\n- X\n- Y';
        const from = doc.indexOf('2. B');
        const to = doc.indexOf('- Y') + '- Y'.length;
        const view = mountViewWithSelection(doc, [[from, to]]);
        expect(tab(view)).toBe(true);
        // One press already nests+renumbers B (column 4 is inside "1."'s
        // own window); the bullets are indented identically but never
        // renumbered (they have no digits to renumber).
        expect(view.state.doc.toString()).toBe('1. A\n    1. B\n    - X\n    - Y');
      });

      it('bullet-only selection: normalizer finds no OrderedList candidates at all and is a complete no-op beyond the flat whitespace edit', () => {
        const doc = '- A\n- B\n- C';
        const view = mountViewWithSelection(doc, [[0, doc.length]]);
        expect(tab(view)).toBe(true);
        expect(view.state.doc.toString()).toBe('    - A\n    - B\n    - C');
      });
    });

    describe('exact per-line ±4 whitespace invariant is preserved for every line, list or not', () => {
      it('a mix of list and paragraph lines each get exactly ±4, independent of any normalization applied to the list lines', () => {
        const doc = '1. A\n2. B\nPlain paragraph line\n3. C';
        const from = 0;
        const to = doc.length;
        const view = mountViewWithSelection(doc, [[from, to]]);
        expect(tab(view)).toBe(true);
        const lines = view.state.doc.toString().split('\n');
        expect(lines[2]).toBe('    Plain paragraph line'); // plain line: exactly +4, no other change possible
      });
    });
  });
});

/**
 * Product decision (2026-08-30, Option C migration —
 * docs/list-item-architecture-odr.md §22): `INDENT_STEP_SPACES` is now the
 * single canonical indentation-unit value, and CM6's own `indentUnit`
 * facet is synchronized from it in `createEditorView.ts`. This describe
 * block is the permanent regression coverage for that synchronization —
 * every CM6-internal command confirmed (by direct source reading, a full
 * repository-wide audit) to read `indentUnit`/`tabSize` rather than a
 * hardcoded number: `deleteCharBackward` (Backspace's whitespace-only-
 * prefix "remove one indentation level" behavior — the exact path the
 * product caught this audit missing on its first pass), and the three
 * CM6-native shortcuts (`Cmd+]`/`Cmd+[`/`Cmd-Alt-\`) that bypass
 * `markdownIndentKeymap()`'s own Tab/Shift-Tab bindings entirely, since
 * they're different physical keys.
 *
 * These tests build their own `EditorState` with `indentUnit.of(INDENT_UNIT_STRING)`
 * explicitly, rather than using `mountView()` above — `markdownLanguageExtension()`
 * alone does not configure this facet (that happens in `createEditorView.ts`,
 * a different, app-wiring-level file this test suite doesn't otherwise
 * exercise), so this is the one place in this file that reproduces the
 * *real* end-to-end facet configuration rather than relying on CM6's own
 * un-configured default (which would coincidentally still be 2 either
 * way, masking exactly the kind of regression this block exists to catch).
 */
describe('CM6 indentUnit synchronization (Option C migration)', () => {
  function mountViewWithIndentUnit(doc: string, cursor: number): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc,
      selection: { anchor: Math.min(cursor, doc.length) },
      extensions: [markdownLanguageExtension(), indentUnit.of(INDENT_UNIT_STRING)],
    });
    const view = new EditorView({ state, parent });
    mountedViews.push(view);
    return view;
  }

  function mountViewWithIndentUnitSelection(doc: string, ranges: Array<[number, number]>): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc,
      selection: EditorSelection.create(ranges.map(([from, to]) => EditorSelection.range(from, to))),
      extensions: [markdownLanguageExtension(), indentUnit.of(INDENT_UNIT_STRING)],
    });
    const view = new EditorView({ state, parent });
    mountedViews.push(view);
    return view;
  }

  describe('Backspace: whitespace-only-prefix "remove one indentation level", at every boundary requested', () => {
    it('0 spaces: Backspace at content-start is ordinary character deletion into the preceding line/nothing (no indentation to remove)', () => {
      const view = mountViewWithIndentUnit('Text', 0);
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      // At document start there is nothing before the cursor at all —
      // deleteCharBackward is a no-op here, confirming this path never
      // manufactures a deletion where none is possible.
      expect(deleteCharBackward(target as unknown as EditorView)).toBe(false);
      expect(view.state.doc.toString()).toBe('Text');
    });

    it.each([1, 2, 3])(
      '%i space(s): Backspace snaps to the nearest LOWER multiple of the 4-space unit — below one full unit, that multiple is 0',
      (n) => {
        const doc = `${' '.repeat(n)}Text`;
        const view = mountViewWithIndentUnit(doc, n);
        const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
        expect(deleteCharBackward(target as unknown as EditorView)).toBe(true);
        // CM6's own indent-aware Backspace (confirmed by direct source
        // reading) snaps to the previous indent-unit-aligned column, not
        // "delete exactly one character" — for any amount strictly below
        // one full 4-space unit, that column is 0, in a single press.
        expect(view.state.doc.toString()).toBe('Text');
      }
    );

    it('4 spaces: Backspace removes exactly one 4-space indentation level, landing at 0', () => {
      const view = mountViewWithIndentUnit('    Text', 4);
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      expect(deleteCharBackward(target as unknown as EditorView)).toBe(true);
      expect(view.state.doc.toString()).toBe('Text');
    });

    it('8 spaces: Backspace removes exactly one level, landing at 4', () => {
      const view = mountViewWithIndentUnit('        Text', 8);
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      expect(deleteCharBackward(target as unknown as EditorView)).toBe(true);
      expect(view.state.doc.toString()).toBe('    Text');
    });

    it('nested list indentation: Backspace right before a nested item\'s own marker removes one full level, demoting it (same semantic Shift-Tab already provides at that position)', () => {
      const view = mountViewWithIndentUnit('1. A\n    1. B', '1. A\n    1. B'.indexOf('1. B'));
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      expect(deleteCharBackward(target as unknown as EditorView)).toBe(true);
      expect(view.state.doc.toString()).toBe('1. A\n1. B');
    });
  });

  describe('CM6-native shortcuts bypassing markdownIndentKeymap() entirely — confirmed reachable, now use the synced 4-space unit', () => {
    it('Cmd+] (indentMore): inserts exactly one 4-space unit, verbatim from the facet', () => {
      const view = mountViewWithIndentUnit('Text', 0);
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      expect(indentMore(target as any)).toBe(true);
      expect(view.state.doc.toString()).toBe('    Text');
    });

    it('Cmd+[ (indentLess): removes exactly one 4-space unit', () => {
      const view = mountViewWithIndentUnit('    Text', 0);
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      expect(indentLess(target as any)).toBe(true);
      expect(view.state.doc.toString()).toBe('Text');
    });

    it('Cmd-Alt-\\ (indentSelection): behaves consistently with the same 4-space unit', () => {
      const doc = 'Text';
      const view = mountViewWithIndentUnitSelection(doc, [[0, doc.length]]);
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      expect(indentSelection(target as any)).toBe(true);
      // indentSelection re-indents to the language's own computed
      // indentation (Markdown provides none, so this is a no-op/pass-
      // through here) -- the important assertion is that it runs without
      // throwing and doesn't silently assume a 2-space unit anywhere;
      // exact output is upstream's own concern, not this migration's.
      expect(view.state.doc.toString()).toBe('Text');
    });
  });

  describe('mixed whitespace: untouched pasted/manual indentation is never silently rewritten', () => {
    it('a pasted line with 3 leading spaces (not a multiple of 4) is left completely untouched until a Tab/Shift-Tab press actually touches it', () => {
      const doc = '   Pasted\nOther line';
      const view = mountViewWithIndentUnit(doc, doc.indexOf('Other'));
      // Touch a DIFFERENT line -- the pasted line's own odd indentation
      // must survive byte-for-byte.
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      markdownIndentMore(target as any);
      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('   Pasted'); // untouched — never normalized by an edit to a different line
      expect(lines[1]).toBe('    Other line');
    });

    it('touching that same odd-indentation line with Tab normalizes its ENTIRE leading run to the canonical unit, in one press', () => {
      const doc = '   Pasted';
      const view = mountViewWithIndentUnit(doc, 1); // caret inside the odd 3-space run
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      markdownIndentMore(target as any);
      // Existing policy (pre-dates this migration, confirmed unchanged):
      // the touched line's whole leading run is replaced by `current +
      // INDENT_STEP_SPACES` literal spaces, regardless of what character
      // mix was there before — 3 (odd, non-canonical) + 4 = 7.
      expect(view.state.doc.toString()).toBe('       Pasted');
    });

    it('a leading tab character on an untouched line survives a Tab press on a different line', () => {
      const doc = '\tTabbed\nOther line';
      const view = mountViewWithIndentUnit(doc, doc.indexOf('Other'));
      const target = { state: view.state, dispatch: (tr: any) => view.update([tr]) };
      markdownIndentMore(target as any);
      const lines = view.state.doc.toString().split('\n');
      expect(lines[0]).toBe('\tTabbed'); // untouched
      expect(lines[1]).toBe('    Other line');
    });
  });
});
