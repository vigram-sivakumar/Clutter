import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { FolderPickerItem, FolderPickerProps } from './FolderPicker.types';
import { Search } from '@components/search/Search';
import { Entry } from '@components/entry/Entry';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { FolderLeading } from '@features/notes/sidebar/FolderLeading';
import { AppIcon } from '@shared/icon';
import { useMenuKeyboard } from '@components/menu/useMenuKeyboard';

import './FolderPicker.css';

/** DOM id for the "Create ..." row — stable so useMenuKeyboard (which keys off element ids) can address it like any other menuitem. */
const CREATE_ITEM_ID = 'folder-picker-create';

export function FolderPicker({
  items,
  placeholder = 'Search folders',
  leadingIcon,
  showPath = false,
  sectionLimit,
  showSectionTitles = true,
  onSelect,
  onCreate,
}: FolderPickerProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The exact same active-item state machine OverflowMenu's <Menu> uses
  // (ArrowUp/Down/Home/End skip aria-disabled items, Enter clicks the
  // active one) — reused directly rather than reimplemented, per
  // useMenuKeyboard's own DOM-query-over-[role="menuitem"] contract,
  // which doesn't care whether its container is a <Menu> or this list.
  // <Menu> itself isn't reused here — it also focuses its own container
  // on mount, which would fight this picker's own requirement to focus
  // the search input instead (see the focus effect below).
  //
  // `preferredActiveId: null` — this picker has no "selected" folder to
  // prefer (you're always picking a *new* destination), just "always
  // highlight the first navigable row" — the hook's own generic
  // preferred-or-first-navigable-item resolution already gives exactly
  // that for free, including across search-filtering, once there's no
  // actual id to prefer. This replaced this file's own hand-rolled
  // `useEffect` doing the identical thing (see below).
  const keyboard = useMenuKeyboard(listRef, { preferredActiveId: null });
  // Every folder starts collapsed — an id lands here only once the user
  // actually expands it. Local to this component instance (not
  // Workspace.isFolderExpanded, the sidebar tree's persisted expansion
  // state): a picker is a transient, per-open surface, and sharing that
  // global state would mean expanding a folder here also expanded it in
  // the sidebar, and vice versa.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      item.title.toLowerCase().includes(normalizedQuery)
    );
  }, [items, normalizedQuery]);

  // Which folders have at least one child in `items` — an item with none
  // renders with no caret at all (hasCaret={!isEmpty} below), the single
  // source of truth for whether a row is expandable.
  const parentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.parentId !== null) {
        ids.add(item.parentId);
      }
    }
    return ids;
  }, [items]);

  // A top-level item (parentId === null — the vault root is never itself
  // an item, so "top-level" here just means "no rendered parent") is
  // always visible; anything nested is visible only once its immediate
  // parent has been expanded. An id can only ever enter expandedIds by
  // being clicked, which requires it to already be visible, so this one
  // parentId check is sufficient — there's no need to walk the full
  // ancestor chain to confirm every ancestor above it is also expanded.
  // Memoized (not a plain inline filter) so its reference only changes
  // when the actual visible set changes — the active-item reset effect
  // below depends on that reference, not on every unrelated render.
  const visibleItems = useMemo(
    () =>
      isSearching
        ? filteredItems
        : filteredItems.filter(
            (item) => item.parentId === null || expandedIds.has(item.parentId)
          ),
    [isSearching, filteredItems, expandedIds]
  );

  // A search with zero matches offers creating a new folder by that exact
  // name instead — never shown for an exact (or partial) existing match,
  // since filteredItems' substring match already succeeds for one. When
  // this is true, `visibleItems` is always empty (see `visibleItems`'s
  // own derivation) — the Create row below is the *only* menuitem
  // rendered, which is exactly why `useMenuKeyboard`'s own
  // first-navigable-item fallback (via `preferredActiveId: null` above)
  // resolves to it automatically, with no special-casing needed here.
  const [expandedSections, setExpandedSections] = useState<ReadonlySet<string>>(() => new Set());

  // Caps each section at `sectionLimit` unless the user expanded it. `toggleAfter` marks the last
  // item shown of every section that has more than the cap — the "Show more/less" row goes there.
  const { displayItems, toggleAfter } = useMemo(() => {
    const toggles = new Map<string, { section: string; expanded: boolean }>();
    if (sectionLimit === undefined) {
      return { displayItems: visibleItems, toggleAfter: toggles };
    }

    const totals = new Map<string, number>();
    for (const item of visibleItems) {
      if (item.section !== undefined) {
        totals.set(item.section, (totals.get(item.section) ?? 0) + 1);
      }
    }

    const seen = new Map<string, number>();
    const shown: FolderPickerItem[] = [];
    for (const item of visibleItems) {
      const section = item.section;
      if (section === undefined) {
        shown.push(item);
        continue;
      }
      const index = seen.get(section) ?? 0;
      seen.set(section, index + 1);
      const expanded = expandedSections.has(section);
      const overLimit = (totals.get(section) ?? 0) > sectionLimit;
      if (overLimit && !expanded && index >= sectionLimit) {
        continue;
      }
      shown.push(item);
      const isLastShown = overLimit && (expanded ? index === (totals.get(section) ?? 0) - 1 : index === sectionLimit - 1);
      if (isLastShown) {
        toggles.set(item.id, { section, expanded });
      }
    }
    return { displayItems: shown, toggleAfter: toggles };
  }, [visibleItems, sectionLimit, expandedSections]);

  // Whether the list has more content below its visible part — exposed as `data-can-scroll-down`
  // so a host can fade the bottom edge only while there is something to scroll to.
  const [canScrollDown, setCanScrollDown] = useState(false);
  // Where the first section's "Show more" row ends, from the top of the list's content, or null
  // when no section is capped (or the layout can't be measured).
  function measureFirstSectionBottom(): number | null {
    const list = listRef.current;
    const toggle = list?.querySelector<HTMLElement>('[id^="folder-picker-toggle-"]');
    if (!list || !toggle) {
      return null;
    }
    const bottom = toggle.getBoundingClientRect().bottom - list.getBoundingClientRect().top + list.scrollTop;
    return bottom > 0 ? bottom : null;
  }

  function updateCanScrollDown() {
    const list = listRef.current;
    if (!list) {
      return;
    }
    // The list's own bottom padding is scrollable but is not content — don't count it, or the
    // fade would dim the last real row whenever the list is capped just short of that padding.
    const padding = parseFloat(getComputedStyle(list).paddingBottom) || 0;
    const moreBelow = list.scrollTop + list.clientHeight < list.scrollHeight - padding - 1;

    // A host may end the list right at the first section's "Show more" row (the
    // `--folder-picker-first-section-bottom` below). That row is the way to more, so while the list
    // sits at the top it is not faded; the fade returns once the user scrolls.
    const firstSectionBottom = measureFirstSectionBottom();
    const endsAtFirstToggle =
      list.scrollTop <= 0 && firstSectionBottom !== null && list.clientHeight <= firstSectionBottom + 5;

    setCanScrollDown(moreBelow && !endsAtFirstToggle);
  }

  // Exposes where the first section's "Show more" row ends as the
  // `--folder-picker-first-section-bottom` CSS variable — so a host can size the list to end right
  // after it (rows differ in height, so no fixed number can). Unset when no section is capped, and
  // unset while the layout can't be measured.
  function updateFirstSectionBottom() {
    const list = listRef.current;
    const bottom = measureFirstSectionBottom();
    if (bottom === null) {
      list?.style.removeProperty('--folder-picker-first-section-bottom');
    } else {
      list?.style.setProperty('--folder-picker-first-section-bottom', `${Math.ceil(bottom)}px`);
    }
  }

  useLayoutEffect(() => {
    updateFirstSectionBottom();
    updateCanScrollDown();
  }, [displayItems]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateCanScrollDown);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  function toggleSection(section: string) {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  const showCreate =
    isSearching && filteredItems.length === 0 && Boolean(onCreate);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // useMenuKeyboard treats Space as "activate the current item" — the
    // right behavior for a non-text-input menu, but this picker's
    // keyboard events originate from a text input, where Space must stay
    // a literal character (e.g. searching "Archive Bin"). Every other key
    // it handles (ArrowUp/Down/Home/End/Enter) is reused unchanged.
    if (event.key === ' ') {
      return;
    }

    keyboard.handleKeyDown(event as unknown as KeyboardEvent<HTMLDivElement>);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="folder-picker">
      <Search
        ref={searchRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleSearchKeyDown}
        // Mirrors <Menu>'s own aria-activedescendant (on its container) —
        // here on the input, since the input (not the list) holds real
        // DOM focus while a row is only ever visually/ARIA-highlighted.
        aria-activedescendant={keyboard.activeId}
        placeholder={placeholder}
      />

      <div
        className="folder-picker__list"
        ref={listRef}
        onScroll={updateCanScrollDown}
        data-can-scroll-down={canScrollDown || undefined}
      >
        {displayItems.map((item, index) => {
          const previousSection = index > 0 ? displayItems[index - 1]!.section : undefined;
          const startsSection = item.section !== undefined && item.section !== previousSection;
          // Reuses the exact same parentIds/isEmpty check the caret's
          // disabled state already relied on — a folder's caret shows
          // only when it actually has at least one child, no separate
          // child-detection mechanism.
          const isEmpty = !parentIds.has(item.id);
          const hasCaret = !isEmpty;
          // A search result's path is a plain-text join of its own
          // ancestor titles — never shown for a root-level match (no
          // ancestors to join), never rendered outside search.
          const path =
            (showPath || isSearching) && item.ancestors && item.ancestors.length > 0
              ? item.ancestors.map((ancestor) => ancestor.title).join(' / ')
              : undefined;

          return (
            <Fragment key={item.id}>
              {startsSection && index > 0 && <div className="menu__divider" role="separator" />}
              {startsSection && showSectionTitles && <MenuGroupTitle>{item.section}</MenuGroupTitle>}
            <Entry
              id={item.id}
              role="menuitem"
              // Rows are never real-DOM-focused (the search input keeps
              // focus throughout) — Entry would otherwise default this to
              // 0 for any row with an onClick, adding every row to the
              // page's natural Tab order.
              tabIndex={-1}
              className="folder-picker__item"
              level={isSearching ? 0 : item.level}
              leading={
                leadingIcon ? (
                  <span className="folder__leading">
                    <AppIcon
                      className="folder__icon"
                      icon={item.icon ?? leadingIcon}
                      emoji={item.emoji}
                    />
                  </span>
                ) : (
                  <FolderLeading
                    emoji={item.emoji}
                    isEmpty={isEmpty}
                    hasCaret={hasCaret}
                    isExpanded={!isSearching && expandedIds.has(item.id)}
                    onExpandToggle={
                      isSearching ? undefined : () => toggleExpanded(item.id)
                    }
                  />
                )
              }
              // forceHover mirrors MenuItem's own "keyboard-active item
              // looks hovered" convention — one visual rule for "this is
              // the current keyboard selection," not a second one invented
              // for this picker.
              forceHover={keyboard.activeId === item.id}
              onMouseEnter={() => keyboard.setActiveId(item.id)}
              onClick={() => onSelect(item)}
            >
              <div className="folder-picker__content">
                <div className="folder-picker__title-row">
                  <span className="folder-picker__title">{item.title}</span>
                  {item.secondaryLabel && (
                    <span className="folder-picker__secondary">
                      {item.secondaryLabel}
                    </span>
                  )}
                </div>
                {!item.secondaryLabel && path && (
                  <span className="folder-picker__path">{path}</span>
                )}
              </div>
            </Entry>
              {toggleAfter.has(item.id) && (
                <Entry
                  id={`folder-picker-toggle-${item.section}`}
                  role="menuitem"
                  tabIndex={-1}
                  className="folder-picker__item"
                  leading={
                    <span className="folder__leading">
                      <AppIcon className="folder__icon" icon="moreHorizontal" />
                    </span>
                  }
                  forceHover={keyboard.activeId === `folder-picker-toggle-${item.section}`}
                  onMouseEnter={() => keyboard.setActiveId(`folder-picker-toggle-${item.section}`)}
                  onClick={() => toggleSection(item.section!)}
                >
                  <span>{toggleAfter.get(item.id)!.expanded ? 'Show less' : 'Show more'}</span>
                </Entry>
              )}
            </Fragment>
          );
        })}

        {showCreate && onCreate && (
          <Entry
            id={CREATE_ITEM_ID}
            role="menuitem"
            tabIndex={-1}
            className="folder__title-create"
            leading={<AppIcon className="create__icon" icon="plus" />}
            forceHover={keyboard.activeId === CREATE_ITEM_ID}
            onMouseEnter={() => keyboard.setActiveId(CREATE_ITEM_ID)}
            onClick={() => onCreate(query.trim())}
          >
            <div className="folder-picker__create">
              <span className="folder-picker__create-label">Create</span>
              <span className="folder-picker__title">{query.trim()}</span>
            </div>
          </Entry>
        )}
      </div>
    </div>
  );
}
