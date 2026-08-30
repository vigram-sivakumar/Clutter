// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { redo, undo, history } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';

function hasNode(state: EditorState, name: string): boolean {
  let found = false;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === name) {
        found = true;
      }
    },
  });
  return found;
}

function typeSpace(state: EditorState, pos: number) {
  return state.update({
    changes: { from: pos, to: pos, insert: ' ' },
    selection: { anchor: pos + 1 },
    userEvent: 'input.type',
  }).state;
}

describe('listMarkerParagraphInterrupt — ordered markers', () => {
  it('typing the completing Space on "1." immediately below a paragraph produces a real OrderedList — no blank line inserted', () => {
    const state = EditorState.create({
      doc: 'Paragraph text here\n1.',
      selection: { anchor: 22 },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, 22);

    expect(after.doc.toString()).toBe('Paragraph text here\n1. ');
    expect(after.doc.toString()).not.toMatch(/\n\n/);
    expect(hasNode(after, 'OrderedList')).toBe(true);
    expect(hasNode(after, 'ListItem')).toBe(true);
  });

  it.each(['2.', '9.', '10.', '99.'])('marker %s behaves the same as "1."', (marker) => {
    const doc = `Paragraph\n${marker}`;
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, doc.length);

    expect(after.doc.toString()).toBe(`Paragraph\n${marker} `);
    expect(hasNode(after, 'OrderedList')).toBe(true);
  });

  it('a marker indented 4+ spaces remains ordinary paragraph text — deliberately out of scope', () => {
    const doc = 'Paragraph\n    1.';
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, doc.length);

    expect(after.doc.toString()).toBe('Paragraph\n    1. ');
    expect(hasNode(after, 'OrderedList')).toBe(false);
  });

  it('already-native cases (doc start, blank-line-preceded) are unaffected', () => {
    const atStart = EditorState.create({ doc: '1.', extensions: [markdownLanguageExtension()] });
    expect(hasNode(atStart, 'OrderedList')).toBe(true);

    const afterBlank = EditorState.create({ doc: 'Paragraph\n\n1.', extensions: [markdownLanguageExtension()] });
    expect(hasNode(afterBlank, 'OrderedList')).toBe(true);
  });

  it('caret position and undo/redo remain correct across the completing Space', () => {
    const state = EditorState.create({
      doc: 'Paragraph\n1.',
      selection: { anchor: 12 },
      extensions: [markdownLanguageExtension(), history()],
    });

    const afterSpace = typeSpace(state, 12);
    expect(afterSpace.selection.main.head).toBe(13);

    let current = afterSpace;
    const dispatch = (tr: { state: EditorState }) => {
      current = tr.state;
    };

    undo({ state: current, dispatch });
    expect(current.doc.toString()).toBe('Paragraph\n1.');
    expect(current.selection.main.head).toBe(12);

    redo({ state: current, dispatch });
    expect(current.doc.toString()).toBe('Paragraph\n1. ');
    expect(current.selection.main.head).toBe(13);
  });
});

describe('listMarkerParagraphInterrupt — bullet markers', () => {
  it.each(['-', '*', '+'])('typing the completing Space on bare "%s" immediately below a paragraph produces a real BulletList — no blank line inserted', (marker) => {
    const doc = `Paragraph text here\n${marker}`;
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, doc.length);

    expect(after.doc.toString()).toBe(`Paragraph text here\n${marker} `);
    expect(after.doc.toString()).not.toMatch(/\n\n/);
    expect(hasNode(after, 'BulletList')).toBe(true);
    expect(hasNode(after, 'ListItem')).toBe(true);
  });

  it('"-" resolves to a real BulletList, not a Setext heading, once the completing Space is typed', () => {
    const state = EditorState.create({
      doc: 'Paragraph\n-',
      selection: { anchor: 11 },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, 11);

    expect(after.doc.toString()).toBe('Paragraph\n- ');
    expect(hasNode(after, 'BulletList')).toBe(true);
    expect(hasNode(after, 'SetextHeading2')).toBe(false);
  });

  it.each(['-', '*', '+'])('a bullet marker "%s" indented 4+ spaces remains ordinary paragraph text — deliberately out of scope', (marker) => {
    const doc = `Paragraph\n    ${marker}`;
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdownLanguageExtension()],
    });

    const after = typeSpace(state, doc.length);

    expect(after.doc.toString()).toBe(`Paragraph\n    ${marker} `);
    expect(hasNode(after, 'BulletList')).toBe(false);
  });

  it('a bullet marker with real content interrupts a paragraph — matches native CommonMark behavior, unaffected by this extension', () => {
    const state = EditorState.create({
      doc: 'Paragraph\n- A',
      extensions: [markdownLanguageExtension()],
    });

    // Native CommonMark already recognizes a bullet + real content as
    // interrupting a paragraph (unlike ordered markers, which natively
    // require digit "1" — see isBulletList vs isOrderedList in
    // @lezer/markdown). This assertion documents that existing, unrelated
    // native behavior is untouched by this extension, not a claim this
    // extension caused it — unlike the ordered-marker case (see the
    // "content-bearing marker" describe block below), bullets never
    // needed the widened predicate for this specific shape.
    expect(hasNode(state, 'BulletList')).toBe(true);
  });

  it('already-native cases (doc start, blank-line-preceded) are unaffected', () => {
    const atStart = EditorState.create({ doc: '-', extensions: [markdownLanguageExtension()] });
    expect(hasNode(atStart, 'BulletList')).toBe(true);

    const afterBlank = EditorState.create({ doc: 'Paragraph\n\n-', extensions: [markdownLanguageExtension()] });
    expect(hasNode(afterBlank, 'BulletList')).toBe(true);
  });

  it('caret position and undo/redo remain correct across the completing Space, for "-"', () => {
    const state = EditorState.create({
      doc: 'Paragraph\n-',
      selection: { anchor: 11 },
      extensions: [markdownLanguageExtension(), history()],
    });

    const afterSpace = typeSpace(state, 11);
    expect(afterSpace.selection.main.head).toBe(12);
    expect(hasNode(afterSpace, 'BulletList')).toBe(true);

    let current = afterSpace;
    const dispatch = (tr: { state: EditorState }) => {
      current = tr.state;
    };

    undo({ state: current, dispatch });
    expect(current.doc.toString()).toBe('Paragraph\n-');
    expect(current.selection.main.head).toBe(11);

    redo({ state: current, dispatch });
    expect(current.doc.toString()).toBe('Paragraph\n- ');
    expect(current.selection.main.head).toBe(12);
  });
});

/**
 * Regression suite for the 2026-08-30 "list reverts to paragraph text as
 * soon as content is typed" bug. Root cause: every parse (incremental or
 * fresh) is a pure function of the *current* text — there is no memory of
 * an earlier recognition. With the predicate scoped to the bare marker
 * only, `Paragraph\n99.` → Space → typing `O` produced `Paragraph\n99. O`
 * satisfying neither this predicate (blank-only) nor native
 * `isOrderedList`'s own `breaking` gate (content-tolerant only for
 * single-digit `1`) — so the list reverted to plain paragraph text on the
 * very next keystroke, for every ordered marker except `1.`. Bullets
 * never had this bug (native `isBulletList` has no digit/character
 * restriction on content-bearing interrupt). Fixed by widening
 * `LIST_MARKER_LINE` to also match marker-plus-content, not just the
 * bare marker — see that constant's own doc comment for why this is the
 * only mechanism available, and why it necessarily also affects
 * `Paragraph\n99. O` typed/pasted fresh with no prior bare-marker moment
 * (unavoidable: the two documents are byte-identical text, and this
 * codebase's architecture forbids hidden state to tell them apart).
 */
describe('listMarkerParagraphInterrupt — regression: list survives content typed after the marker', () => {
  function dumpTopLevelNodeNames(state: EditorState): string[] {
    const names: string[] = [];
    syntaxTree(state).iterate({
      enter: (node) => {
        names.push(node.name);
      },
    });
    return names;
  }

  it('the exact reported case: "Paragraph\\n99." + Space + "O" stays a real OrderedList across each incremental keystroke', () => {
    const step0 = EditorState.create({
      doc: 'Paragraph\n99.',
      selection: { anchor: 13 },
      extensions: [markdownLanguageExtension()],
    });

    const step1 = typeSpace(step0, 13);
    expect(step1.doc.toString()).toBe('Paragraph\n99. ');
    expect(hasNode(step1, 'OrderedList')).toBe(true);

    const step2 = step1.update({
      changes: { from: 14, to: 14, insert: 'O' },
      selection: { anchor: 15 },
      userEvent: 'input.type',
    }).state;

    expect(step2.doc.toString()).toBe('Paragraph\n99. O');
    expect(hasNode(step2, 'OrderedList')).toBe(true);
    expect(hasNode(step2, 'ListItem')).toBe(true);
  });

  it('the incremental result matches a completely fresh parse of the same final text (proves this is not a fragment-reuse artifact)', () => {
    const step0 = EditorState.create({
      doc: 'Paragraph\n99.',
      selection: { anchor: 13 },
      extensions: [markdownLanguageExtension()],
    });
    const step1 = typeSpace(step0, 13);
    const step2 = step1.update({
      changes: { from: 14, to: 14, insert: 'O' },
      selection: { anchor: 15 },
    }).state;

    const fresh = EditorState.create({
      doc: 'Paragraph\n99. O',
      extensions: [markdownLanguageExtension()],
    });

    expect(dumpTopLevelNodeNames(step2)).toEqual(dumpTopLevelNodeNames(fresh));
    expect(hasNode(fresh, 'OrderedList')).toBe(true);
  });

  it.each(['1.', '2.', '9.', '10.', '99.', '100.'])(
    'marker %s: bare → Space → typed content, list survives every step',
    (marker) => {
      const before = `Paragraph\n${marker}`;
      const step0 = EditorState.create({
        doc: before,
        selection: { anchor: before.length },
        extensions: [markdownLanguageExtension()],
      });

      const step1 = typeSpace(step0, before.length);
      expect(hasNode(step1, 'OrderedList')).toBe(true);

      const pos = step1.selection.main.head;
      const step2 = step1.update({
        changes: { from: pos, to: pos, insert: 'Buy milk' },
        selection: { anchor: pos + 8 },
      }).state;

      expect(step2.doc.toString()).toBe(`Paragraph\n${marker} Buy milk`);
      expect(hasNode(step2, 'OrderedList')).toBe(true);
      expect(hasNode(step2, 'ListItem')).toBe(true);
    }
  );

  it.each(['-', '*', '+'])('bullet marker %s: bare → Space → typed content, list survives every step (already worked, confirmed still holds)', (marker) => {
    const before = `Paragraph\n${marker}`;
    const step0 = EditorState.create({
      doc: before,
      selection: { anchor: before.length },
      extensions: [markdownLanguageExtension()],
    });

    const step1 = typeSpace(step0, before.length);
    expect(hasNode(step1, 'BulletList')).toBe(true);

    const pos = step1.selection.main.head;
    const step2 = step1.update({
      changes: { from: pos, to: pos, insert: 'Buy milk' },
      selection: { anchor: pos + 8 },
    }).state;

    expect(step2.doc.toString()).toBe(`Paragraph\n${marker} Buy milk`);
    expect(hasNode(step2, 'BulletList')).toBe(true);
  });

  it('typing content in a single combined transaction (not two separate keystrokes) also survives', () => {
    const step0 = EditorState.create({
      doc: 'Paragraph\n99.',
      selection: { anchor: 13 },
      extensions: [markdownLanguageExtension()],
    });

    const after = step0.update({
      changes: { from: 13, to: 13, insert: ' O' },
      selection: { anchor: 15 },
    }).state;

    expect(after.doc.toString()).toBe('Paragraph\n99. O');
    expect(hasNode(after, 'OrderedList')).toBe(true);
  });

  it('the recognized state is stable on repeated reads with no further edits (no flip-flopping)', () => {
    const step0 = EditorState.create({
      doc: 'Paragraph\n99.',
      selection: { anchor: 13 },
      extensions: [markdownLanguageExtension()],
    });
    const step1 = typeSpace(step0, 13);
    const step2 = step1.update({ changes: { from: 14, to: 14, insert: 'O' }, selection: { anchor: 15 } }).state;

    expect(hasNode(step2, 'OrderedList')).toBe(true);
    expect(hasNode(step2, 'OrderedList')).toBe(true);
    expect(hasNode(step2, 'OrderedList')).toBe(true);
  });

  it('undo/redo across the full bare-marker → Space → content sequence remains correct', () => {
    const step0 = EditorState.create({
      doc: 'Paragraph\n99.',
      selection: { anchor: 13 },
      extensions: [markdownLanguageExtension(), history()],
    });

    const step1 = typeSpace(step0, 13);
    const step2 = step1.update({
      changes: { from: 14, to: 14, insert: 'O' },
      selection: { anchor: 15 },
      userEvent: 'input.type',
    }).state;
    expect(hasNode(step2, 'OrderedList')).toBe(true);

    let current = step2;
    const dispatch = (tr: { state: EditorState }) => {
      current = tr.state;
    };

    // CM6's default history groups consecutive same-`userEvent` typed
    // keystrokes into one undo step (confirmed: a single undo below
    // reverts both the Space and the "O" together, not one at a time) —
    // the invariant under test is that undo/redo round-trips correctly
    // through the state where the list existed, not the exact number of
    // undo steps CM6 chose to group them into.
    undo({ state: current, dispatch });
    expect(current.doc.toString()).toBe('Paragraph\n99.');
    expect(current.selection.main.head).toBe(13);

    redo({ state: current, dispatch });
    expect(current.doc.toString()).toBe('Paragraph\n99. O');
    expect(hasNode(current, 'OrderedList')).toBe(true);
  });

  it('the widened predicate still declines every previously-verified false-positive shape', () => {
    const cases: [string, boolean][] = [
      ['Paragraph\nSee section 1.', false], // marker not at line start
      ['Paragraph\n1.foo', false], // no real separator after marker
      ['Paragraph\n1234567890.', false], // 10 digits exceeds the 9-digit cap
      ['Paragraph\n1234567890. real content', false], // same, with content
      ['Paragraph\nabc', false], // no marker at all
    ];

    for (const [doc, expected] of cases) {
      const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
      expect(hasNode(state, 'OrderedList')).toBe(expected);
      expect(hasNode(state, 'BulletList')).toBe(expected);
    }
  });

  it('4+ space indentation stays out of scope even with content present', () => {
    const doc = 'Paragraph\n    99. Buy milk';
    const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });

    expect(hasNode(state, 'OrderedList')).toBe(false);
  });
});
