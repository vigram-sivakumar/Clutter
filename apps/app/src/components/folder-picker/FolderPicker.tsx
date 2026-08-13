import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { FolderPickerProps } from './FolderPicker.types';
import { Search } from '@components/search/Search';
import { Entry } from '@components/entry/Entry';
import { FolderLeading } from '@features/notes/sidebar/FolderLeading';
import { AppIcon } from '@shared/icon';
import { useMenuKeyboard } from '@components/menu/useMenuKeyboard';

import './FolderPicker.css';

/** DOM id for the "Create ..." row — stable so useMenuKeyboard (which keys off element ids) can address it like any other menuitem. */
const CREATE_ITEM_ID = 'folder-picker-create';

export function FolderPicker({ items, onSelect, onCreate }: FolderPickerProps) {
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
  const keyboard = useMenuKeyboard(listRef);
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
  // since filteredItems' substring match already succeeds for one.
  const showCreate =
    isSearching && filteredItems.length === 0 && Boolean(onCreate);

  // Resets the highlighted item to the first visible result whenever the
  // visible set actually changes (a new search query, or an
  // expand/collapse) — same "first item becomes active" expectation
  // OverflowMenu's <Menu> establishes for ArrowDown from no selection,
  // applied proactively here since a picker (unlike a static menu) has a
  // result set that changes while it's open. The Create row participates
  // in the exact same reset — it's just another menuitem in this list, so
  // it becomes the active item whenever it's the only thing showing.
  useEffect(() => {
    keyboard.setActiveId(
      visibleItems[0]?.id ?? (showCreate ? CREATE_ITEM_ID : undefined)
    );
    // keyboard.setActiveId has a stable identity (useState setter) and
    // deliberately isn't in the dependency list — only a real change to
    // the visible result set should reset the highlight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems, showCreate]);

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
        placeholder="Search folders"
      />

      <div className="folder-picker__list" ref={listRef}>
        {visibleItems.map((item) => {
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
            isSearching && item.ancestors && item.ancestors.length > 0
              ? item.ancestors.map((ancestor) => ancestor.title).join(' / ')
              : undefined;

          return (
            <Entry
              key={item.id}
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
                <FolderLeading
                  emoji={item.emoji}
                  isEmpty={isEmpty}
                  hasCaret={hasCaret}
                  isExpanded={!isSearching && expandedIds.has(item.id)}
                  onExpandToggle={
                    isSearching ? undefined : () => toggleExpanded(item.id)
                  }
                />
              }
              // forceHover mirrors MenuItem's own "keyboard-active item
              // looks hovered" convention — one visual rule for "this is
              // the current keyboard selection," not a second one invented
              // for this picker.
              forceHover={keyboard.activeId === item.id}
              onMouseEnter={() => keyboard.setActiveId(item.id)}
              onClick={() => onSelect(item)}
            >
              <div className="folder__content">
                <span className="folder__title">{item.title}</span>
                {path && <span className="folder__path">{path}</span>}
              </div>
            </Entry>
          );
        })}

        {showCreate && onCreate && (
          <Entry
            id={CREATE_ITEM_ID}
            role="menuitem"
            tabIndex={-1}
            className="tertiary"
            leading={<AppIcon icon="plus" />}
            forceHover={keyboard.activeId === CREATE_ITEM_ID}
            onMouseEnter={() => keyboard.setActiveId(CREATE_ITEM_ID)}
            onClick={() => onCreate(query.trim())}
          >
            {`Create "${query.trim()}"`}
          </Entry>
        )}
      </div>
    </div>
  );
}
