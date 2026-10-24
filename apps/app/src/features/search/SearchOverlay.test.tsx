// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchOverlay, SEARCH_DEBOUNCE_MS } from './SearchOverlay';
import { SEARCH_PAGE_SIZE, type SearchResult, type SearchService } from '@core/application/search/SearchService';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function result(overrides: Partial<SearchResult> & { id: string; title: string }): SearchResult {
  return {
    kind: 'note',
    type: 'note',
    isDraft: false,
    titleHighlights: [],
    folders: [],
    icon: null,
    matchedBy: 'title',
    closeMatch: false,
    moreMatches: 0,
    matchedTags: [],
    snippets: [],
    ...overrides,
  };
}

const BODY_RESULT = result({
  id: 'body',
  title: 'Meeting notes',
  matchedBy: 'body',
  folders: ['Work'],
  snippets: [
    { text: 'discussed the roadmap', highlights: [{ from: 14, to: 21 }], range: { from: 20, to: 27 } },
    { text: 'roadmap review next week', highlights: [{ from: 0, to: 7 }], range: { from: 90, to: 97 } },
  ],
});
const TITLE_RESULT = result({ id: 'title', title: 'Roadmap', titleHighlights: [{ from: 0, to: 7 }] });

/**
 * A stand-in for `SearchService` whose jobs behave like the real ones: stepped, resumable, paged. `answer(query)`
 * is every result for a query; a job returns the first `wanted` of them and `loadMore` extends from there.
 * `stepsToFinish` makes a job take several slices; `held` jobs never finish until `release()`.
 */
function fakeService(
  answer: (query: string) => SearchResult[],
  options: { stepsToFinish?: number; hold?: boolean } = {}
) {
  const jobs: Array<{ query: string; release: () => void; step: ReturnType<typeof vi.fn> }> = [];
  const warmupStep = vi.fn(() => true);

  const startSearch = vi.fn((query: string, wanted: number) => {
    if (query.trim() === '') {
      return undefined;
    }

    const all = answer(query);
    let wantedNow = wanted;
    let steps = 0;
    let released = !options.hold;
    const job = {
      tokens: [],
      results: [] as SearchResult[],
      step: vi.fn(() => {
        steps++;

        if (!released || steps < (options.stepsToFinish ?? 1)) {
          return false;
        }

        job.results.splice(0, job.results.length, ...all.slice(0, wantedNow));
        return true;
      }),
      get isComplete() {
        return job.results.length >= wantedNow || job.results.length >= all.length;
      },
      get hasMore() {
        return job.results.length < all.length;
      },
      loadMore: vi.fn((count: number) => {
        wantedNow += count;
        steps = (options.stepsToFinish ?? 1) - 1;
      }),
    };

    jobs.push({ query, release: () => (released = true), step: job.step });

    return job;
  });

  return {
    service: { startSearch, startWarmup: vi.fn(() => ({ step: warmupStep })) },
    startSearch,
    warmupStep,
    jobs,
  };
}

function setup(
  options: {
    initialQuery?: string;
    open?: boolean;
    answer?: (query: string) => SearchResult[];
    stepsToFinish?: number;
    hold?: boolean;
  } = {}
) {
  const fake = fakeService(
    options.answer ?? ((query) => (query.trim() === '' ? [] : [TITLE_RESULT, BODY_RESULT])),
    { stepsToFinish: options.stepsToFinish, hold: options.hold }
  );
  const listeners = new Set<() => void>();
  const effectivePageState = {
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const onQueryChange = vi.fn();
  const returnFocusRef = { current: null as HTMLElement | null };

  function Host() {
    const [open] = useState(options.open ?? true);

    return (
      <SearchOverlay
        open={open}
        onClose={onClose}
        searchService={fake.service as unknown as SearchService}
        effectivePageState={effectivePageState as unknown as EffectivePageState}
        initialQuery={options.initialQuery ?? ''}
        onQueryChange={onQueryChange}
        onSelect={onSelect}
        returnFocusRef={returnFocusRef}
      />
    );
  }

  render(<Host />);

  return {
    ...fake,
    effectivePageState,
    notify: () => act(() => void listeners.forEach((listener) => listener())),
    onClose,
    onSelect,
    onQueryChange,
    input: () => screen.queryByRole('searchbox') as HTMLInputElement | null,
  };
}

const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
const settle = () => act(() => void vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 5));
const run = (ms = 50) => act(() => void vi.advanceTimersByTime(ms));

describe('SearchOverlay', () => {
  it('focuses the input when it opens', () => {
    const { input } = setup();

    expect(input()).toHaveFocus();
  });

  it('shows the kept query and its results as soon as it opens', () => {
    const { input, startSearch } = setup({ initialQuery: 'roadmap' });

    expect(input()).toHaveValue('roadmap');
    expect(startSearch).toHaveBeenCalledWith('roadmap', SEARCH_PAGE_SIZE);
    expect(screen.getByText('Meeting notes')).toBeInTheDocument();
  });

  it('does no search work, and subscribes to nothing, while closed', () => {
    const { startSearch, service, effectivePageState, notify } = setup({ open: false, initialQuery: 'roadmap' });

    notify();
    run(1000);

    expect(startSearch).not.toHaveBeenCalled();
    expect(service.startWarmup).not.toHaveBeenCalled();
    expect(effectivePageState.subscribe).not.toHaveBeenCalled();
  });

  it('searches once typing settles, not on every keystroke, and reports the query', () => {
    const { input, startSearch, onQueryChange } = setup();

    startSearch.mockClear();
    type(input()!, 'r');
    type(input()!, 'ro');
    type(input()!, 'road');

    expect(onQueryChange).toHaveBeenLastCalledWith('road');
    expect(startSearch).not.toHaveBeenCalled();

    settle();

    expect(startSearch).toHaveBeenCalledTimes(1);
    expect(startSearch).toHaveBeenLastCalledWith('road', SEARCH_PAGE_SIZE);
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
  });

  it('searches again when the app reports a change (an edit, a title, a draft…), debounced', () => {
    const { input, startSearch, notify } = setup({ initialQuery: 'roadmap' });

    startSearch.mockClear();
    notify();
    notify();
    notify();

    expect(startSearch).not.toHaveBeenCalled();

    settle();

    expect(startSearch).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue('roadmap');
  });

  it('prepares the pages while the query is empty, and stops once a search is under way', () => {
    const { input, warmupStep, startSearch } = setup();

    run(20);
    expect(warmupStep).toHaveBeenCalled();

    warmupStep.mockClear();
    type(input()!, 'road');
    settle();
    run(50);

    expect(startSearch).toHaveBeenCalled();
    expect(warmupStep).not.toHaveBeenCalled();
  });

  it('marks the words that matched, in the title and in the excerpt', () => {
    setup({ initialQuery: 'roadmap' });

    const marks = Array.from(document.querySelectorAll('mark.search-entry__match')).map((mark) => mark.textContent);

    expect(marks).toEqual(['Roadmap', 'roadmap']);
  });

  it('shows a hint with no query', () => {
    setup();

    expect(screen.getByText(/Search notes, templates, assets and folders/)).toBeInTheDocument();
  });

  it('marks a template, an asset and a folder with a small pill beside the title, and a note with none', () => {
    const { input } = setup({
      answer: () => [
        result({ id: 't', title: 'Weekly review', kind: 'template', folders: ['Templates'] }),
        result({ id: 'a', title: 'Site plan', kind: 'asset', type: null, assetKind: 'pdf' }),
        result({ id: 'f', title: 'Projects', kind: 'folder', type: null }),
        result({ id: 'n', title: 'Plain note' }),
      ],
    });

    type(input()!, 'e');
    settle();

    const pillOf = (title: string) => screen.getByText(title).parentElement?.querySelector('.pill')?.textContent;

    expect(pillOf('Weekly review')).toBe('Template');
    expect(pillOf('Site plan')).toBe('PDF');
    expect(pillOf('Projects')).toBe('Folder');
    expect(pillOf('Plain note')).toBeUndefined();
  });

  it('shows the alias a note was found by as a pill, like the type', () => {
    const { input } = setup({
      answer: () => [result({ id: 'p', title: 'Plan', matchedBy: 'alias', matchedAlias: 'Roadmap', aliasHighlights: [{ from: 0, to: 4 }] })],
    });

    type(input()!, 'road');
    settle();

    expect(screen.getByText('Plan').parentElement?.querySelector('.pill')?.textContent).toBe('Alias: Roadmap');
    expect(screen.getByText('Road').tagName).toBe('MARK');
    expect(screen.queryByText('Alias:')?.tagName).not.toBe('MARK');
  });

  it('shows a message when nothing matches', () => {
    const { input } = setup({ answer: () => [] });

    type(input()!, 'zzz');
    settle();

    expect(screen.getByText('No results for “zzz”')).toBeInTheDocument();
  });

  it('selects results with Arrow Up/Down and opens the active one with Enter', () => {
    const { input, onSelect } = setup({ initialQuery: 'roadmap' });
    const field = input()!;

    // The first result is active on open.
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(TITLE_RESULT, undefined);

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    // A body match lands on its first matching line.
    expect(onSelect).toHaveBeenLastCalledWith(BODY_RESULT, BODY_RESULT.snippets[0]);

    fireEvent.keyDown(field, { key: 'ArrowUp' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(TITLE_RESULT, undefined);
  });

  it('opens the clicked excerpt’s line', () => {
    const { onSelect } = setup({ initialQuery: 'roadmap' });

    fireEvent.click(screen.getByText('discussed the', { exact: false }));

    expect(onSelect).toHaveBeenCalledWith(BODY_RESULT, BODY_RESULT.snippets[0]);
  });

  it('keeps each result compact: title, location, one excerpt, and a count of the other matches', () => {
    setup({ initialQuery: 'roadmap' });

    const row = document.getElementById('search-result-body')!;

    expect(row.querySelectorAll('.search-entry__excerpt')).toHaveLength(1);
    expect(row.textContent).toContain('Meeting notes');
    expect(row.textContent).toContain('Work');
    expect(row.textContent).toContain('1 more match');
    expect(row.textContent).not.toContain('roadmap review next week');
  });

  it('marks only a result that needed a typo tolerated as a close match', () => {
    setup({
      initialQuery: 'naw',
      answer: () => [result({ id: 'close', title: 'New note', closeMatch: true }), result({ id: 'exact', title: 'Naw people' })],
    });

    expect(document.getElementById('search-result-close')!.textContent).toContain('Close match');
    expect(document.getElementById('search-result-exact')!.textContent).not.toContain('Close match');
  });

  it('shows how many results there are and how to move', () => {
    setup({ initialQuery: 'roadmap' });

    expect(screen.getByText('2 results')).toBeInTheDocument();
    const footer = document.querySelector('.search-overlay__footer')!;

    // Key chips with the registry's arrow icons — not text glyphs.
    expect(footer.querySelector('[data-icon="arrowUp"]')).not.toBeNull();
    expect(footer.querySelector('[data-icon="arrowDown"]')).not.toBeNull();
    expect(footer.textContent).toContain('Navigate');
    expect(footer.querySelector('[data-icon="keyEnter"]')).not.toBeNull();
    expect(footer.textContent).toContain('Open');
    expect(footer.textContent).not.toMatch(/[↑↓↵↩]|Enter/);
  });

  it('selects the first result by default, so a typed title can be opened with Enter at once', () => {
    const { input, onSelect } = setup({ initialQuery: 'roadmap' });

    expect(input()).toHaveAttribute('aria-activedescendant', 'search-result-title');
    fireEvent.keyDown(input()!, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(TITLE_RESULT, undefined);
  });

  it('does not use Enter during IME composition', () => {
    const { input, onSelect } = setup({ initialQuery: 'roadmap' });

    fireEvent.keyDown(input()!, { key: 'Enter', isComposing: true });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on Escape and on a backdrop click, but not on a click inside', () => {
    const { onClose, input } = setup({ initialQuery: 'roadmap' });

    fireEvent.click(screen.getByRole('search'));
    fireEvent.click(input()!);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(document.querySelector('.overlay__backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('clears the query from the clear button and keeps focus in the input', () => {
    const { input, onQueryChange } = setup({ initialQuery: 'roadmap' });

    fireEvent.click(screen.getByLabelText('Clear search'));

    expect(input()).toHaveValue('');
    expect(onQueryChange).toHaveBeenLastCalledWith('');
    expect(input()).toHaveFocus();
  });
});

describe('SearchOverlay — long searches', () => {
  it('keeps working in slices between frames until the job reports done', () => {
    const { jobs } = setup({ initialQuery: 'roadmap', stepsToFinish: 4 });

    expect(screen.queryByText('Meeting notes')).toBeNull(); // not finished yet
    expect(jobs[0]!.step).toHaveBeenCalledTimes(1);

    run(0);
    run(0);
    expect(screen.queryByText('Meeting notes')).toBeNull();

    run(5);
    expect(jobs[0]!.step.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('Meeting notes')).toBeInTheDocument();
  });

  it('never shows results from a query that has been replaced, even if it finishes late', () => {
    const answers: Record<string, SearchResult[]> = {
      old: [result({ id: 'old-result', title: 'From the old query' })],
      newer: [result({ id: 'new-result', title: 'From the new query' })],
    };
    const { input, jobs } = setup({ answer: (query) => answers[query] ?? [], hold: true });

    type(input()!, 'old');
    settle();
    expect(jobs).toHaveLength(1);

    // The user keeps typing before the first search has finished.
    type(input()!, 'newer');
    settle();
    expect(jobs).toHaveLength(2);

    // The superseded job finishing now must change nothing…
    act(() => jobs[0]!.release());
    run(50);
    expect(screen.queryByText('From the old query')).toBeNull();

    // …and the current one shows its own results.
    act(() => jobs[1]!.release());
    run(50);
    expect(screen.getByText('From the new query')).toBeInTheDocument();
    expect(screen.queryByText('From the old query')).toBeNull();
  });

  it('marks the list as out of date while a new query is being searched, and ignores clicks on it', () => {
    const { input, onSelect } = setup({ initialQuery: 'roadmap' });
    const list = screen.getByRole('menu');

    expect(list).not.toHaveAttribute('data-stale');

    // Typing makes what is on screen an answer to an older question until the new search has finished.
    type(input()!, 'roadmap x');
    expect(list).toHaveAttribute('data-stale');
    expect(list).toHaveAttribute('aria-busy', 'true');

    fireEvent.click(screen.getByText('Roadmap'));
    expect(onSelect).not.toHaveBeenCalled();

    settle();
    run(20);

    expect(list).not.toHaveAttribute('data-stale');
    fireEvent.click(screen.getByText('Roadmap'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('opens the top result when Enter is pressed before the new results are ready', () => {
    const { input, jobs, onSelect } = setup({ initialQuery: 'roadmap', hold: true });

    // The first job (kept query) is held; release it so there is something on screen.
    act(() => jobs[0]!.release());
    run(20);
    expect(screen.getByText('Roadmap')).toBeInTheDocument();

    type(input()!, 'roadmap x');
    fireEvent.keyDown(input()!, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled(); // queued, not the stale top result

    settle();
    act(() => jobs[jobs.length - 1]!.release());
    run(20);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(TITLE_RESULT, undefined);
  });
});

describe('SearchOverlay — show more results', () => {
  const MANY = Array.from({ length: SEARCH_PAGE_SIZE * 2 + 7 }, (_, i) =>
    result({ id: `r${String(i).padStart(3, '0')}`, title: `Result ${i}` })
  );
  const rows = () => screen.getAllByRole('menuitem').filter((row) => row.id !== 'search-show-more');

  it('shows one page, then a Show more row that brings the next page without repeating any', () => {
    setup({ initialQuery: 'result', answer: () => MANY });

    expect(rows()).toHaveLength(SEARCH_PAGE_SIZE);
    const more = screen.getByText('Show more results');

    fireEvent.click(more);
    run(20);

    expect(rows()).toHaveLength(SEARCH_PAGE_SIZE * 2);
    const ids = rows().map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);

    fireEvent.click(screen.getByText('Show more results'));
    run(20);

    expect(rows()).toHaveLength(MANY.length);
    expect(screen.queryByText('Show more results')).toBeNull();
    expect(new Set(rows().map((row) => row.id)).size).toBe(MANY.length);
  });

  it('asks the same job for more instead of searching again', () => {
    const { startSearch } = setup({ initialQuery: 'result', answer: () => MANY });

    expect(startSearch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Show more results'));
    run(20);

    expect(startSearch).toHaveBeenCalledTimes(1);
  });

  it('is reachable and operable from the keyboard, and continues from the first new result', () => {
    const { input } = setup({ initialQuery: 'result', answer: () => MANY });
    const field = input()!;

    // End of the first page: the Show more row is the next menu item after the last result.
    for (let i = 0; i < SEARCH_PAGE_SIZE; i++) {
      fireEvent.keyDown(field, { key: 'ArrowDown' });
    }

    expect(document.getElementById('search-show-more')).toHaveClass('entry-force-hover');
    expect(field).toHaveAttribute('aria-activedescendant', 'search-show-more');

    fireEvent.keyDown(field, { key: 'Enter' });
    run(20);

    expect(rows()).toHaveLength(SEARCH_PAGE_SIZE * 2);
    expect(field).toHaveAttribute('aria-activedescendant', `search-result-r${String(SEARCH_PAGE_SIZE).padStart(3, '0')}`);
  });

  it('starts again from one page when the query changes', () => {
    const { input, startSearch } = setup({ initialQuery: 'result', answer: () => MANY });

    fireEvent.click(screen.getByText('Show more results'));
    run(20);
    expect(rows()).toHaveLength(SEARCH_PAGE_SIZE * 2);

    type(input()!, 'results');
    settle();

    expect(startSearch).toHaveBeenLastCalledWith('results', SEARCH_PAGE_SIZE);
    expect(rows()).toHaveLength(SEARCH_PAGE_SIZE);
  });

  it('keeps the expanded list when the same query is refreshed by a change in the vault', () => {
    const { startSearch, notify } = setup({ initialQuery: 'result', answer: () => MANY });

    fireEvent.click(screen.getByText('Show more results'));
    run(20);

    notify();
    settle();
    run(20);

    expect(startSearch).toHaveBeenLastCalledWith('result', SEARCH_PAGE_SIZE * 2);
    expect(rows()).toHaveLength(SEARCH_PAGE_SIZE * 2);
  });

  it('offers no Show more row when everything fit on the first page', () => {
    setup({ initialQuery: 'roadmap' });

    expect(screen.queryByText('Show more results')).toBeNull();
  });
});

describe('SearchOverlay — modal behavior', () => {
  it('keeps Tab inside the overlay: it wraps between the field and the clear button', () => {
    const { input } = setup({ initialQuery: 'roadmap' });
    const clear = screen.getByLabelText('Clear search');

    expect(input()).toHaveFocus();

    clear.focus();
    fireEvent.keyDown(clear, { key: 'Tab' }); // from the last focusable: back to the first
    expect(input()).toHaveFocus();

    fireEvent.keyDown(input()!, { key: 'Tab', shiftKey: true }); // from the first: round to the last
    expect(clear).toHaveFocus();
  });

  it('hands focus straight back when something behind the overlay takes it', () => {
    const outside = document.createElement('button');

    document.body.appendChild(outside);

    const { input } = setup({ initialQuery: 'roadmap' });

    outside.focus();

    expect(input()).toHaveFocus();
    outside.remove();
  });

  it('claims global shortcuts so they cannot act on the page behind it', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');

    const { input } = setup({ initialQuery: 'roadmap' });

    for (const init of [
      { code: 'KeyN', metaKey: true }, // new note
      { code: 'Digit3', metaKey: true }, // go to Tasks
      { code: 'KeyT', metaKey: true, shiftKey: true }, // new task
      { code: 'Backslash', metaKey: true }, // toggle sidebar
    ]) {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

      input()!.dispatchEvent(event);
      expect(event.defaultPrevented, init.code).toBe(true);
    }
  });

  it('leaves editing keys alone: select all, copy and paste still work in the field', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');

    const { input } = setup({ initialQuery: 'roadmap' });

    for (const code of ['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ']) {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code, metaKey: true });

      input()!.dispatchEvent(event);
      expect(event.defaultPrevented, code).toBe(false);
    }
  });

  it('⌘K while open just refocuses the field', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');

    const { input, onClose } = setup({ initialQuery: 'roadmap' });

    screen.getByLabelText('Clear search').focus();
    fireEvent.keyDown(screen.getByLabelText('Clear search'), { code: 'KeyK', metaKey: true });

    expect(input()).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });
});

