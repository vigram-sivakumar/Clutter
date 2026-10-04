// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { completionStatus, selectedCompletion, startCompletion } from '@codemirror/autocomplete';
import { defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { semanticCompletion } from '../completion';
import type { EmbedHeadingSuggestion, EmbedResourceSuggestion, EmbedTargetSuggestion } from '../embed/embedSuggestion';
import { markdownLanguageExtension } from '../markdownLanguage';
import type { WikiLinkPageSuggestion } from '../wikilink/wikiLinkSuggestion';
import { COMPLETION_SECTION_LIMIT } from './completionSectionLimit';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const notes = (count: number): WikiLinkPageSuggestion[] =>
  Array.from({ length: count }, (_, i) => ({ kind: 'page', path: `Note ${i}`, title: `Note ${i}`, breadcrumb: null }));
const dailyNotes = (count: number): WikiLinkPageSuggestion[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: 'page',
    path: `Daily Notes/2026-01-${String(i + 1).padStart(2, '0')}`,
    title: `2026-01-${String(i + 1).padStart(2, '0')}`,
    breadcrumb: 'Daily Notes',
    dailyNote: true,
  }));
const images = (count: number): EmbedResourceSuggestion[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: 'resource',
    path: `img${i}.png`,
    title: `img${i}.png`,
    breadcrumb: null,
    resourceKind: 'image',
  }));

interface Suggestions {
  wiki?: WikiLinkPageSuggestion[];
  embed?: EmbedTargetSuggestion[];
  tags?: string[];
  headings?: EmbedHeadingSuggestion[];
}

const views: EditorView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

function mount(doc: string, suggestions: Suggestions): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        markdownLanguageExtension(),
        // The editor's own Enter (a newline) sits below the popup's, as in the real editor.
        keymap.of(defaultKeymap),
        semanticCompletion(
          () => () => suggestions.wiki ?? [],
          () => () => suggestions.tags ?? [],
          () => () => suggestions.embed ?? [],
          () => () => suggestions.headings ?? []
        ),
      ],
    }),
    parent,
  });
  views.push(view);
  return view;
}

async function open(doc: string, suggestions: Suggestions): Promise<EditorView> {
  const view = mount(doc, suggestions);
  startCompletion(view);
  await wait(250);
  expect(completionStatus(view.state)).toBe('active');
  return view;
}

/** The popup's option labels in order, from the rows the user sees. */
function rows(view: EditorView): string[] {
  return Array.from(view.dom.querySelectorAll('.cm-tooltip-autocomplete li')).map(
    (li) => li.querySelector('.completion-row__title')?.textContent ?? ''
  );
}

const press = (view: EditorView, key: string) =>
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

const isToggle = (label: string) => /^Show (\d+ more|less)$/.test(label);

/** Picks a row the way a click does: CM6 reads the option from the `<li>`'s `mousedown`. */
async function click(view: EditorView, label: string): Promise<void> {
  const li = Array.from(view.dom.querySelectorAll('.cm-tooltip-autocomplete li')).find(
    (el) => el.querySelector('.completion-row__title')?.textContent === label
  );
  expect(li).toBeDefined();
  li!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await wait(250);
}

describe('"Show N more" in the [[ popup', () => {
  it('lists only the first rows of a long section, then "Show N more" with how many are hidden', async () => {
    const view = await open('See [[', { wiki: notes(24) });

    const list = rows(view);
    expect(list).toHaveLength(COMPLETION_SECTION_LIMIT + 1);
    expect(list.slice(0, COMPLETION_SECTION_LIMIT)).toEqual(notes(24).slice(0, COMPLETION_SECTION_LIMIT).map((n) => n.title));
    expect(list[COMPLETION_SECTION_LIMIT]).toBe('Show 19 more');
  });

  it('adds no toggle to a section that fits', async () => {
    const view = await open('See [[', { wiki: notes(COMPLETION_SECTION_LIMIT) });

    expect(rows(view)).toHaveLength(COMPLETION_SECTION_LIMIT);
    expect(rows(view).some(isToggle)).toBe(false);
  });

  it('expands to every row on click, ending in "Show less", with the popup still open and the document untouched', async () => {
    const view = await open('See [[', { wiki: notes(24) });

    await click(view, 'Show 19 more');

    expect(completionStatus(view.state)).toBe('active');
    expect(view.state.doc.toString()).toBe('See [[');
    const list = rows(view);
    expect(list).toHaveLength(24 + 1);
    expect(list[list.length - 1]).toBe('Show less');
    expect(list).toContain('Note 23');
  });

  it('collapses again on "Show less"', async () => {
    const view = await open('See [[', { wiki: notes(24) });
    await click(view, 'Show 19 more');

    await click(view, 'Show less');

    expect(completionStatus(view.state)).toBe('active');
    expect(rows(view)).toHaveLength(COMPLETION_SECTION_LIMIT + 1);
    expect(rows(view)[COMPLETION_SECTION_LIMIT]).toBe('Show 19 more');
    expect(view.state.doc.toString()).toBe('See [[');
  });

  it('caps each section on its own, each with its own toggle', async () => {
    const view = await open('See [[', { wiki: [...notes(12), ...dailyNotes(15)] });

    expect(rows(view).filter(isToggle)).toEqual(['Show 7 more', 'Show 10 more']);

    // Expanding one section leaves the other capped.
    await click(view, 'Show 7 more');
    expect(rows(view).filter(isToggle)).toEqual(['Show less', 'Show 10 more']);
  });

  it('collapses when the user types — a new query starts capped', async () => {
    const view = await open('See [[', { wiki: notes(24) });
    await click(view, 'Show 19 more');
    expect(rows(view)).toHaveLength(25);

    view.dispatch({
      changes: { from: view.state.doc.length, insert: 'N' },
      selection: { anchor: view.state.doc.length + 1 },
      userEvent: 'input.type',
    });
    await wait(300);

    expect(rows(view)).toHaveLength(COMPLETION_SECTION_LIMIT + 1);
  });

  it('collapses when the cursor moves', async () => {
    const view = await open('See [[', { wiki: notes(24) });
    await click(view, 'Show 19 more');

    view.dispatch({ selection: { anchor: 0 } });
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    startCompletion(view);
    await wait(250);

    expect(rows(view)).toHaveLength(COMPLETION_SECTION_LIMIT + 1);
  });

  it('keeps each editor\'s expansion to itself — it is editor state, not module state', async () => {
    const first = await open('See [[', { wiki: notes(24) });
    const second = await open('See [[', { wiki: notes(24) });

    await click(first, 'Show 19 more');

    expect(rows(first)).toHaveLength(25);
    expect(rows(second)).toHaveLength(COMPLETION_SECTION_LIMIT + 1);
  });
});

describe('"Show N more" in the ![[ popup', () => {
  it('caps a long Images section the same way', async () => {
    const view = await open('![[', { embed: images(13) });

    expect(rows(view)).toHaveLength(COMPLETION_SECTION_LIMIT + 1);
    expect(rows(view)[COMPLETION_SECTION_LIMIT]).toBe('Show 8 more');

    await click(view, 'Show 8 more');
    expect(rows(view)).toHaveLength(13 + 1);
    expect(rows(view)[13]).toBe('Show less');
    expect(view.state.doc.toString()).toBe('![[');
  });

  it('caps notes, Daily notes and images each on their own, over the one combined result', async () => {
    const view = await open('![[', { embed: [...images(9), ...dailyNotes(7), ...notes(8)] });

    // Sections come in rank order whatever order the source listed them in.
    // Media first (images), then notes, then Daily notes.
    expect(rows(view).filter(isToggle)).toEqual(['Show 4 more', 'Show 3 more', 'Show 2 more']);
    expect(rows(view)).toHaveLength(3 * (COMPLETION_SECTION_LIMIT + 1));
    expect(rows(view).slice(0, COMPLETION_SECTION_LIMIT)).toEqual(images(5).map((n) => n.title));

    // Expanding one section leaves the others capped.
    await click(view, 'Show 4 more');
    expect(rows(view).filter(isToggle)).toEqual(['Show less', 'Show 3 more', 'Show 2 more']);
    expect(rows(view)).toHaveLength(9 + 1 + 2 * (COMPLETION_SECTION_LIMIT + 1));
  });
});

describe('the short popups have no toggle', () => {
  it('a bare # opens at once with every tag, capped like the other long lists', async () => {
    const view = await open('x #', { tags: Array.from({ length: 15 }, (_, i) => `tag${i}`) });

    expect(rows(view)).toHaveLength(COMPLETION_SECTION_LIMIT + 1);
    expect(rows(view)[COMPLETION_SECTION_LIMIT]).toBe('Show 10 more');

    await click(view, 'Show 10 more');
    expect(rows(view)).toHaveLength(15 + 1);
    expect(view.state.doc.toString()).toBe('x #');
  });

  it('adds no toggle to a short list of tags', async () => {
    const view = await open('x #', { tags: ['a', 'b', 'c'] });

    expect(rows(view)).toEqual(['a', 'b', 'c']);
  });

  it('does not cap ![[Page# headings', async () => {
    const headings: EmbedHeadingSuggestion[] = Array.from({ length: 14 }, (_, i) => ({ kind: 'heading', heading: `H ${i}`, level: 2 }));
    const view = await open('![[Page#', { headings });

    expect(rows(view)).toHaveLength(14);
    expect(rows(view).some(isToggle)).toBe(false);
  });

  it('does not cap the Create row', async () => {
    const view = await open('See [[Nope', { wiki: [{ kind: 'create', path: 'Nope', create: () => {} } as never] });

    expect(rows(view)).toEqual(['Create "Nope"']);
  });
});

describe('keeping the user\'s place across the refresh', () => {
  it('selects the first row that was hidden after expanding, and the toggle after collapsing', async () => {
    const view = await open('See [[', { wiki: notes(24) });

    await click(view, 'Show 19 more');
    expect((selectedCompletion(view.state) as { label: string }).label).toBe('Note 5');

    await click(view, 'Show less');
    expect((selectedCompletion(view.state) as { label: string }).label).toBe('Show 19 more');
  });

  it('works from the keyboard: Enter on the toggle expands, then Enter accepts the revealed row', async () => {
    const view = await open('See [[', { wiki: notes(24) });
    await wait(100);

    press(view, 'ArrowUp'); // wraps to the toggle
    press(view, 'Enter');
    await wait(250);
    expect(rows(view)).toHaveLength(25);
    expect(view.state.doc.toString()).toBe('See [[');

    press(view, 'Enter');
    await wait(250);
    expect(view.state.doc.toString()).toBe('See [[Note 5]] ');
  });

  it('does not let a quick second Enter through to the editor as a newline while the popup refreshes', async () => {
    const view = await open('See [[', { wiki: notes(24) });
    await wait(100);

    press(view, 'ArrowUp');
    press(view, 'Enter');
    press(view, 'Enter'); // lands while the popup is disabled, waiting for the refreshed list
    await wait(300);

    expect(view.state.doc.toString()).toBe('See [[');
  });

  it('stops holding Enter once the popup closes, so a stuck refresh cannot eat the editor\'s Enter', async () => {
    const view = await open('See [[', { wiki: notes(24) });
    await wait(100);

    press(view, 'ArrowUp');
    press(view, 'Enter');
    press(view, 'Escape');
    await wait(300);
    expect(completionStatus(view.state)).toBeNull();

    press(view, 'Enter');
    expect(view.state.doc.toString()).toBe('See [[\n');
  });
});
