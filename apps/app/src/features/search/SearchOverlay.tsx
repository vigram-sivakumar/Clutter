import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, RefObject } from 'react';

import { Dialog } from '@components/dialog/Dialog';
import {
  SearchEntry,
  type SearchEntryPill,
} from '@components/entry/SearchEntry';
import { Search } from '@components/search/Search';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { useMenuKeyboard } from '@components/menu/useMenuKeyboard';
import { ShortcutKey } from '@components/shortcut-key/ShortcutKey';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { getPageIcon } from '@core/presentation/getPageIcon';
import {
  SEARCH_PAGE_SIZE,
  type SearchJob,
  type SearchResult,
  type SearchService,
} from '@core/application/search/SearchService';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { Snippet } from '@core/application/search/matchPage';
import { matchShortcut } from '@app/shortcuts/shortcuts';

import './SearchOverlay.css';

/** How long typing (and a burst of editor/Vault notifications) settles before the results are recomputed. */
export const SEARCH_DEBOUNCE_MS = 120;

/** How long one slice of search work may run before the browser gets the thread back (a frame is ~16 ms). */
export const SEARCH_SLICE_MS = 8;

const SHOW_MORE_ID = 'search-show-more';

interface SearchOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly searchService: SearchService;
  /** Told when anything a search reads may have changed (an edit, a title, a draft, the Vault) — see ADR-061. */
  readonly effectivePageState: EffectivePageState;
  /** The query to show when the overlay opens (it survives closing; the owner keeps it for the Space's lifetime). */
  readonly initialQuery: string;
  readonly onQueryChange: (query: string) => void;
  /**
   * Opens the result. `snippet` is the line to land on (the one clicked, or — for a body match opened with Enter —
   * the first); absent for a result that matched by title, alias or tag and was not asked for a line.
   */
  readonly onSelect: (
    result: SearchResult,
    snippet: Snippet | undefined
  ) => void;
  /** Where focus goes back to when the overlay closes (the owner sets `.current` to null to skip it, e.g. after opening a note). */
  readonly returnFocusRef: RefObject<HTMLElement>;
}

/**
 * The Search overlay: a centered dialog with one input and the ranked results below it. It is mounted only while
 * open, so a closed overlay does no search work.
 */
export function SearchOverlay({
  open,
  onClose,
  returnFocusRef,
  ...contentProps
}: SearchOverlayProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="large"
      top={96}
      scrim="strong"
      className="search-overlay"
      returnFocusRef={returnFocusRef}
    >
      <SearchOverlayContent {...contentProps} />
    </Dialog>
  );
}

/** The icon a result leads with: its page type's, or its file's, or a folder's. */
function iconFor(result: SearchResult): SystemIcon {
  if (result.kind === 'asset') {
    return result.assetKind === 'pdf' ? 'pdf' : 'image';
  }

  return getPageIcon(result.type ?? 'folder');
}

function kindLabel(result: SearchResult, listsRecent: boolean): string | undefined {
  if (listsRecent && result.type === 'daily-note') {
    return 'Daily note';
  }

  switch (result.kind) {
    case 'template':
      return 'Template';
    case 'asset':
      return result.assetKind === 'pdf' ? 'PDF' : 'Image';
    case 'folder':
      return 'Folder';
    default:
      return undefined;
  }
}

/** The pills beside a title: what the result is when it is not a plain note, and the alias it was found by. */
function pillsFor(result: SearchResult, listsRecent: boolean): SearchEntryPill[] {
  const kind = kindLabel(result, listsRecent);
  const pills: SearchEntryPill[] = kind ? [{ label: kind }] : [];

  if (result.matchedBy === 'alias' && result.matchedAlias) {
    const name = 'Alias:';
    const offset = name.length + 1;

    pills.push({
      label: `${name} ${result.matchedAlias}`,
      matches: result.aliasHighlights?.map((range) => ({
        from: range.from + offset,
        to: range.to + offset,
      })),
    });
  }

  return pills;
}

/** The plain labels after a title: a draft, a close match, and the tags found. */
function badgesFor(result: SearchResult): string[] {
  const badges: string[] = [];

  if (result.isDraft) {
    badges.push('Draft');
  }

  if (result.closeMatch) {
    badges.push('Close match');
  }

  if (result.matchedBy === 'tag' && result.matchedTags.length > 0) {
    badges.push(result.matchedTags.map((tag) => `#${tag}`).join(' '));
  }

  return badges;
}

/** Matching lines the row does not show: the snippets beyond the first, and any beyond those. */
function moreMatchesLabel(result: SearchResult): string | undefined {
  const count = Math.max(0, result.snippets.length - 1) + result.moreMatches;

  return count === 0
    ? undefined
    : count === 1
      ? '1 more match'
      : `${count} more matches`;
}

/** A menu or dialog opened from inside the overlay's own tree (none today) must keep the focus it takes. */
function isInsideAnotherOverlay(target: Node): boolean {
  return (
    target instanceof Element &&
    target.closest('.overlay') !== null &&
    target.closest('.search-overlay') === null
  );
}

function resultId(result: SearchResult): string {
  return `search-result-${result.id}`;
}

/** What Enter or a click opens: the clicked line, else (for a body or spread match) its first line, else just the note. */
function landingFor(result: SearchResult, clicked: Snippet | undefined) {
  const landsInBody =
    result.matchedBy === 'body' ||
    result.matchedBy === 'mixed' ||
    result.matchedBy === 'heading';

  return clicked ?? (landsInBody ? result.snippets[0] : undefined);
}

function SearchOverlayContent({
  searchService,
  effectivePageState,
  initialQuery,
  onQueryChange,
  onSelect,
}: Omit<SearchOverlayProps, 'open' | 'onClose' | 'returnFocusRef'>) {
  const [query, setQuery] = useState(initialQuery);
  const [revision, setRevision] = useState(0);
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  /** The query `results` answer. While it differs from the input the list is out of date, and is shown as such. */
  const [answeredQuery, setAnsweredQuery] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const keyboard = useMenuKeyboard(listRef, { preferredActiveId: preferredId });

  // The one search in progress. A new query (or a change in what a search reads) replaces it; the replaced job is
  // never stepped again, so what it found can never reach the screen after a newer search has begun.
  const jobRef = useRef<SearchJob | undefined>(undefined);
  const sliceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const wantedRef = useRef(SEARCH_PAGE_SIZE);
  const lastQueryRef = useRef<string | undefined>(undefined);
  const enterQueuedRef = useRef(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const trimmed = query.trim();
  const isStale = answeredQuery !== trimmed;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();

    // Focus cannot leave the overlay: anything outside it that would take focus hands it straight back to the input.
    const keepFocusInside = (event: FocusEvent): void => {
      if (
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target) &&
        !isInsideAnotherOverlay(event.target)
      ) {
        inputRef.current?.focus();
      }
    };

    document.addEventListener('focusin', keepFocusInside);

    return () => {
      document.removeEventListener('focusin', keepFocusInside);
      clearTimeout(sliceTimerRef.current);
    };
  }, []);

  // Anything a search reads changed: search again once things settle. Subscribed only while the overlay is open.
  useEffect(
    () =>
      effectivePageState.subscribe(() => setRevision((current) => current + 1)),
    [effectivePageState]
  );

  /** Steps `job` in short slices between frames until it reports done, then runs `onDone`. Stops at once if replaced. */
  function drive(
    job: SearchJob,
    onSlice: () => void,
    onDone: () => void
  ): void {
    const tick = (): void => {
      if (jobRef.current !== job) {
        return;
      }

      const done = job.step(SEARCH_SLICE_MS);

      if (!done) {
        sliceTimerRef.current = setTimeout(tick, 0);
        return;
      }

      onSlice();
      onDone();
    };

    tick();
  }

  useEffect(() => {
    clearTimeout(sliceTimerRef.current);
    // Whatever was being loaded belonged to the job being replaced.
    setIsLoadingMore(false);

    const queryChanged = lastQueryRef.current !== trimmed;
    const first = lastQueryRef.current === undefined;
    lastQueryRef.current = trimmed;

    // A new question starts from one page of results; a refresh of the same question keeps what the user expanded.
    if (queryChanged) {
      wantedRef.current = SEARCH_PAGE_SIZE;
      setPreferredId(null);
    }

    const start = (): void => {
      const job = searchService.startSearch(trimmed, wantedRef.current);
      jobRef.current = job;

      if (!job) {
        // Nothing to look for: show what was last created or edited. Meanwhile prepare the pages for the first real query.
        setResults(searchService.recent());
        setHasMore(false);
        setAnsweredQuery(trimmed);

        const warmup = searchService.startWarmup();
        const prepare = (): void => {
          if (jobRef.current === undefined && !warmup.step(SEARCH_SLICE_MS)) {
            sliceTimerRef.current = setTimeout(prepare, 0);
          }
        };

        sliceTimerRef.current = setTimeout(prepare, 0);
        return;
      }

      drive(
        job,
        () => {
          setResults([...job.results]);
          setHasMore(job.hasMore);
          setAnsweredQuery(trimmed);
        },
        () => {
          if (enterQueuedRef.current) {
            enterQueuedRef.current = false;
            const top = job.results[0];

            if (top) {
              selectRef.current(top, landingFor(top, undefined));
            }
          }
        }
      );
    };

    // The very first pass runs at once (the kept query shows as soon as the overlay opens); later ones wait for typing to settle.
    if (first) {
      start();
      return () => clearTimeout(sliceTimerRef.current);
    }

    jobRef.current = undefined;
    const timer = setTimeout(start, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      clearTimeout(sliceTimerRef.current);
    };
  }, [trimmed, revision, searchService]);

  function loadMore(): void {
    const job = jobRef.current;

    if (!job || isLoadingMore || !job.hasMore) {
      return;
    }

    const before = job.results.length;

    wantedRef.current += SEARCH_PAGE_SIZE;
    job.loadMore(SEARCH_PAGE_SIZE);
    setIsLoadingMore(true);

    drive(
      job,
      () => {
        setResults([...job.results]);
        setHasMore(job.hasMore);
      },
      () => {
        setIsLoadingMore(false);
        // Keyboard users carry on from the first of the new results rather than from the top of the list.
        const firstNew = job.results[before];

        if (firstNew) {
          setPreferredId(resultId(firstNew));
        }
      }
    );
  }

  useEffect(() => {
    if (keyboard.activeId) {
      document
        .getElementById(keyboard.activeId)
        ?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [keyboard.activeId]);

  function changeQuery(next: string): void {
    enterQueuedRef.current = false;
    setQuery(next);
    onQueryChange(next);
  }

  /**
   * Keys that belong to the overlay while it is open. Tab stays inside it; a global shortcut (⌘N, ⌘1, ⇧⌘T…) must not
   * act on the page behind it, so it is claimed here — the dispatcher skips what is already handled. Editing keys
   * (⌘A, ⌘C, ⌘V…) are not shortcuts and keep working in the field. (The desktop menu bar's own accelerators are the
   * OS's, and cannot be claimed from the page.)
   */
  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Tab') {
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'input:not([disabled]), button:not([disabled])'
        ) ?? []
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (first && last) {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

      return;
    }

    const shortcut = matchShortcut(event.nativeEvent);

    if (shortcut) {
      event.preventDefault();

      if (shortcut.id === 'open-search') {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Only the keys that move through results; Home/End/Space stay with the text field.
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Enter' && isStale && trimmed !== '') {
      // The list on screen answers an older query: open the top result of the one being typed as soon as it is ready.
      event.preventDefault();
      enterQueuedRef.current = true;
      return;
    }

    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter'
    ) {
      if (event.key !== 'Enter') {
        event.preventDefault();
      }

      keyboard.handleKeyDown(event as unknown as KeyboardEvent<HTMLDivElement>);
    }
  }

  function select(
    result: SearchResult,
    event: MouseEvent<HTMLDivElement>
  ): void {
    if (isStale) {
      return;
    }

    // The row shows one excerpt; a click on it lands on that line.
    const clicked = (event.target as HTMLElement).closest(
      '.search-entry__excerpt'
    )
      ? result.snippets[0]
      : undefined;

    onSelect(result, landingFor(result, clicked));
  }

  return (
    <div
      className="search-overlay__panel"
      role="search"
      ref={panelRef}
      onKeyDown={handlePanelKeyDown}
    >
      <Search
        ref={inputRef}
        className="search-overlay__input"
        value={query}
        placeholder="Search notes, templates, assets and folders"
        aria-label="Search notes"
        aria-activedescendant={keyboard.activeId}
        onChange={(event) => changeQuery(event.target.value)}
        onClear={() => {
          changeQuery('');
          inputRef.current?.focus();
        }}
        onKeyDown={handleKeyDown}
      />

      <div
        className="search-overlay__list"
        ref={listRef}
        role="menu"
        aria-label="Search results"
        aria-busy={isStale || isLoadingMore}
        data-stale={isStale || undefined}
      >
        {trimmed === '' && results.length > 0 && <MenuGroupTitle>Recent</MenuGroupTitle>}

        {results.map((result) => (
          <SearchEntry
            key={`${result.kind}-${result.id}`}
            id={resultId(result)}
            role="menuitem"
            tabIndex={-1}
            icon={iconFor(result)}
            emoji={result.icon}
            title={result.title}
            pills={pillsFor(result, trimmed === '')}
            badges={badgesFor(result)}
            path={
              result.folders.length > 0 ? result.folders.join(' / ') : undefined
            }
            titleMatches={result.titleHighlights}
            excerpt={result.snippets[0]?.text}
            excerptMatches={result.snippets[0]?.highlights}
            more={moreMatchesLabel(result)}
            forceHover={keyboard.activeId === resultId(result)}
            onMouseEnter={() => keyboard.setActiveId(resultId(result))}
            onClick={(event) => select(result, event)}
          />
        ))}

        {hasMore && !isStale && (
          <SearchEntry
            id={SHOW_MORE_ID}
            role="menuitem"
            tabIndex={-1}
            className="search-overlay__more"
            icon="moreHorizontal"
            title={isLoadingMore ? 'Loading…' : 'Show more results'}
            forceHover={keyboard.activeId === SHOW_MORE_ID}
            onMouseEnter={() => keyboard.setActiveId(SHOW_MORE_ID)}
            onClick={loadMore}
          />
        )}

        {trimmed === '' && results.length === 0 && (
          <p className="search-overlay__status">
            Notes you create or edit show up here. Search notes, templates, assets and folders
          </p>
        )}
        {trimmed !== '' && !isStale && results.length === 0 && (
          <p className="search-overlay__status" role="status">
            No results for “{trimmed}”
          </p>
        )}
      </div>

      {trimmed !== '' && results.length > 0 && (
        <div
          className="search-overlay__footer"
          aria-hidden={isStale || undefined}
        >
          <span>
            {results.length}
            {hasMore ? '+' : ''}{' '}
            {results.length === 1 && !hasMore ? 'result' : 'results'}
          </span>
          <span className="search-overlay__hints">
            <span className="search-overlay__hint">
              <ShortcutKey leading={<AppIcon icon="arrowUp" />} />
              <ShortcutKey leading={<AppIcon icon="arrowDown" />} />
              Navigate
            </span>
            <span className="search-overlay__hint">
              <ShortcutKey leading={<AppIcon icon="keyEnter" />} />
              Open
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
