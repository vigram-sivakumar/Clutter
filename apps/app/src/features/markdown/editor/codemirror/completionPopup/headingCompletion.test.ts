// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  CompletionContext,
  acceptCompletion,
  completionStatus,
  currentCompletions,
  moveCompletionSelection,
  selectedCompletion,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { semanticCompletion } from '../completion';
import { embedCompletionSource } from '../embed/embedCompletionSource';
import { markdownLanguageExtension } from '../markdownLanguage';
import { acceptReferenceForDisplayName, wikiLinkAutocomplete } from '../wikilink/wikiLinkAutocomplete';
import { wikiLinkCompletionSource } from '../wikilink/wikiLinkCompletionSource';
import { headingCompletionResult, headingRow, type GetHeadingSuggestions, type HeadingCompletion } from './headingCompletion';

const HEADINGS = [
  { kind: 'heading' as const, heading: 'Setup', level: 2 },
  { kind: 'heading' as const, heading: 'Appendix', level: 1 },
];

function mount(doc: string, getHeadings: GetHeadingSuggestions | undefined, extra: boolean = false): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      ...(extra ? [semanticCompletion(() => () => [], undefined, () => () => [], () => getHeadings), wikiLinkAutocomplete()] : []),
    ],
  });
  return new EditorView({ state, parent });
}

function type(view: EditorView, pos: number, text: string): number {
  view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, userEvent: 'input.type' });
  return pos + text.length;
}

// The query runs after `activateOnTypingDelay` (100ms); accepting / moving is ignored for `interactionDelay` (75ms) after it opens.
const waitForQuery = () => new Promise((resolve) => setTimeout(resolve, 250));

describe('headingCompletionResult', () => {
  const apply = vi.fn();

  it('is undefined (not a heading reference) when the reference has no #', () => {
    expect(headingCompletionResult('Note B', 0, 6, () => HEADINGS, apply)).toBeUndefined();
  });

  it('is null — never a fallback to note suggestions — with no suggester or nothing to offer', () => {
    expect(headingCompletionResult('Note B#', 0, 7, undefined, apply)).toBeNull();
    expect(headingCompletionResult('Note B#x', 0, 8, () => [], apply)).toBeNull();
  });

  it('splits at the first #, keeps a folder prefix, and queries that one page', () => {
    const getHeadings = vi.fn(() => HEADINGS);

    const result = headingCompletionResult('Notes/Note B#Set#up', 3, 22, getHeadings, apply) as CompletionResult;

    expect(getHeadings).toHaveBeenCalledWith('Notes/Note B', 'Set#up');
    expect([result.from, result.to, result.filter]).toEqual([3, 22, false]);
    expect(result.options.map((option) => (option as HeadingCompletion).target)).toEqual([
      'Notes/Note B#Setup',
      'Notes/Note B#Appendix',
    ]);
  });

  it('hands the syntax-specific apply the whole page#heading target and the replace range', () => {
    const view = mount('', undefined);
    const spy = vi.fn();
    const result = headingCompletionResult('Note B#', 5, 12, () => HEADINGS, spy) as CompletionResult;
    const option = result.options[0]!;

    (option.apply as (view: EditorView, c: unknown, from: number, to: number) => void)(view, option, 5, 12);

    expect(spy).toHaveBeenCalledWith(view, 'Note B#Setup', 5, 12);
  });
});

describe('headingRow', () => {
  it("shows the heading's text with its level on the right, and no section", () => {
    const result = headingRow({ kind: 'heading', heading: 'Billing', level: 2 });

    expect(result.row).toMatchObject({ title: 'Billing', trailing: 'H2' });
    expect(result).not.toHaveProperty('section');
  });
});

/**
 * `[[Page#` and `![[Page#` run ONE heading completion; these pin that the two syntaxes behave alike, and
 * differ only in how the accepted target is written.
 */
describe.each([
  { name: 'WikiLink', open: '[[', source: (get: GetHeadingSuggestions | undefined) => wikiLinkCompletionSource(() => () => [], () => get) },
  { name: 'Embed', open: '![[', source: (get: GetHeadingSuggestions | undefined) => embedCompletionSource(() => () => [], () => get) },
])('$name heading completion', ({ open, source }) => {
  function run(doc: string, pos: number, get: GetHeadingSuggestions | undefined) {
    const view = mount(doc, get);
    return { view, result: source(get)(new CompletionContext(view.state, pos, false)) as CompletionResult | null };
  }

  it('offers the same headings, with the same rows, for the same target — a folder prefix kept', () => {
    const getHeadings = vi.fn(() => HEADINGS);
    const doc = `x ${open}Notes/Note B#`;
    const { result } = run(doc, doc.length, getHeadings);

    expect(getHeadings).toHaveBeenCalledWith('Notes/Note B', '');
    expect(result?.options.map((o) => [o.label, (o as HeadingCompletion).row.trailing])).toEqual([
      ['Setup', 'H2'],
      ['Appendix', 'H1'],
    ]);
  });

  it('passes what follows # as the filter, and re-queries as more is typed', () => {
    const getHeadings = vi.fn(() => [HEADINGS[0]!]);
    const doc = `x ${open}Note B#Set`;
    run(doc, doc.length, getHeadings);

    expect(getHeadings).toHaveBeenCalledWith('Note B', 'Set');
  });

  it('offers nothing — and no "create a note" fallback — with no suggester, an unknown note, or no matching heading', () => {
    const doc = `x ${open}Nope#`;

    expect(run(doc, doc.length, undefined).result).toBeNull();
    expect(run(doc, doc.length, () => []).result).toBeNull();
  });

  it('reactivating inside a closed reference replaces only the reference zone and keeps an existing |alias', () => {
    const doc = `x ${open}Note B#Set|View actions]] y`;
    const pos = doc.indexOf('Set') + 3;
    const { view, result } = run(doc, pos, () => HEADINGS);
    const option = result!.options[0]!;

    (option.apply as (v: EditorView, c: unknown, f: number, t: number) => void)(view, option, result!.from, result!.to!);

    expect(view.state.doc.toString()).toContain(`${open}Note B#Setup|View actions]]`);
    expect(result!.from).toBe(doc.indexOf('Note B'));
    expect(result!.to).toBe(doc.indexOf('|'));
  });
});

describe('accepting a heading through the real completion popup', () => {
  async function open(doc: string, typed: string) {
    const view = mount(doc, () => HEADINGS, true);
    type(view, doc.length, typed);
    await waitForQuery();
    return view;
  }

  it('[[Note B# lists the headings; accepting one writes [[Note B#Setup]]', async () => {
    const view = await open('x [[Note B', '#');

    expect(completionStatus(view.state)).toBe('active');
    expect(currentCompletions(view.state).map((c) => c.label)).toEqual(['Setup', 'Appendix']);
    acceptCompletion(view);

    expect(view.state.doc.toString()).toBe('x [[Note B#Setup]] ');
  });

  it('![[Note B# lists the SAME headings; accepting one writes ![[Note B#Setup]]', async () => {
    const view = await open('x ![[Note B', '#');

    expect(currentCompletions(view.state).map((c) => c.label)).toEqual(['Setup', 'Appendix']);
    acceptCompletion(view);

    expect(view.state.doc.toString()).toBe('x ![[Note B#Setup]]\n');
  });

  it.each(['[[', '![['])('%s: the arrow keys move the selection and Enter accepts the highlighted heading', async (opener) => {
    const view = await open(`x ${opener}Note B`, '#');

    moveCompletionSelection(true)(view);
    expect((selectedCompletion(view.state) as HeadingCompletion).target).toBe('Note B#Appendix');
    acceptCompletion(view);

    expect(view.state.doc.toString()).toContain(`${opener}Note B#Appendix]]`);
  });

  it('| commits the highlighted heading as the reference and starts the display text: [[Note B#Setup|]]', async () => {
    const view = await open('x [[Note B', '#');

    expect(acceptReferenceForDisplayName(view)).toBe(true);

    expect(view.state.doc.toString()).toBe('x [[Note B#Setup|]]');
    expect(view.state.selection.main.head).toBe('x [[Note B#Setup|'.length);
  });
});
