import type { KeyboardEvent, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LanguageDescription } from '@codemirror/language';

import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuTitle } from '@components/menu/MenuTitle';
import { Search } from '@components/search/Search';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { useMenuContext } from '@components/menu/Menu.context';

import { fencedCodeLanguageDescriptions } from './fencedCodeLanguages';

import './FencedCodeActionsMenu.css';

export interface FencedCodeActionsMenuAnchor {
  readonly current: HTMLElement;
}

export interface FencedCodeActionsMenuProps {
  readonly anchor: FencedCodeActionsMenuAnchor | null;
  readonly onClose: () => void;
  /** The block's current raw `CodeInfo` text (`''`/`undefined` when there's none) — used only to mark the matching language as currently selected. */
  readonly currentRawInfo?: string;
  /** Rewrites only the block's info string to `languageName` (one of `fencedCodeLanguageDescriptions`' own canonical `name`s, lowercased) — never touches the code content. See `fencedCodeInfoRange.ts`'s own doc comment for the exact range this replaces. */
  readonly onChangeLanguage?: (languageName: string) => void;
  /** Formats the block's `CodeText` via Prettier — `undefined` (not merely a no-op handler) when the block's language isn't formattable, so the menu item itself isn't rendered at all, matching the removed standalone Format button's own "no button for an unsupported language" contract. Moved here from a dedicated persistent button in the wrapper-removal migration (2026-09-16) — see `MarkdownEditor.css`'s own doc comment on `.cm-code-block-copy`. */
  readonly onFormat?: () => void;
  /** Exports the block's own `CodeText` (never the fences or the info string) to a user-chosen destination via the native Save dialog. See `downloadTextFile.ts`'s own doc comment for the download mechanism and `fencedCodeFileExtension.ts` for the language → extension mapping. */
  readonly onDownload?: () => void;
  /** Deletes the entire fenced code block — opening marker, all content, closing marker. See `fencedCodeRemovalRange.ts`'s own doc comment for the exact range/blank-line rule. Plain CM6 undo restores it. */
  readonly onRemove?: () => void;
}

type MenuView = 'actions' | 'language';

/**
 * The fenced-code-block "More actions" menu.
 *
 * **Change Language swaps this same `Menu`'s content in place — it does
 * NOT open a nested submenu/second `Overlay`, and it is NOT a separate,
 * custom menu container either.** *Locked, replaces both the original
 * `OverflowMenuBody`+submenu design and this file's own first view-swap
 * pass (which built a standalone `.fenced-code-language-picker` div
 * instead of reusing `Menu`).* One shared `<Menu size="medium">` renders
 * either the Actions items or the language list — both views get
 * identical container styling, sizing, border/radius/shadow, and
 * keyboard navigation for free, and `MenuItem` (not a hand-rolled
 * `Entry` + manual `forceHover`/`onMouseEnter` wiring) drives every row
 * in both views identically.
 *
 * **`Menu`'s own `autoFocus` prop (added for this feature — see its own
 * doc comment) is what makes this possible.** `Menu` always focuses its
 * own container on mount; a search input needs that focus instead. This
 * is investigated and confirmed as the *only* actual conflict — the
 * keyboard/roving-active-item system (`useMenuKeyboard`, `MenuContext`)
 * and `MenuItem` themselves have no assumption baked in about what holds
 * real DOM focus, confirmed by reading `Menu.tsx`/`MenuItem.tsx`/
 * `useMenuKeyboard.ts` directly before this pass, not assumed. With
 * `autoFocus={false}` and `Search` rendered as a direct DOM child of
 * `Menu`'s own container, keydown events bubble to `Menu`'s own
 * `onKeyDown={keyboard.handleKeyDown}` natively — no manual
 * event-forwarding needed (the standalone-container version of this file
 * had to do exactly that manually, precisely because it wasn't a `Menu`
 * descendant).
 *
 * **`aria-activedescendant` follows real DOM focus, not blindly copied
 * onto the `Search` input.** `Menu`'s own container still carries its own
 * `aria-activedescendant` (unconditionally, unchanged) — but since real
 * focus lives on `Search` while the language view is showing, `Search`
 * itself also carries `aria-activedescendant` pointing at the same
 * `activeId`, matching the exact convention `FolderPicker.tsx` already
 * established for this precise situation (a focused text input owning a
 * virtually-navigated list below it) — not a newly-invented pattern.
 *
 * **`useMenuContext()` (the same hook `MenuItem` itself uses internally)
 * is called directly by `LanguagePickerContent` below, just to *read*
 * `activeId`** (for the `Search` input's own `aria-activedescendant`) —
 * the only way to reach `Menu`'s context from outside `MenuItem` is to be
 * a React descendant of `Menu`'s own `MenuContext.Provider`, which is why
 * the language view's content is its own small component rather than
 * inline JSX in `FencedCodeActionsMenu` itself.
 *
 * **The active row itself — preferring the fence's current language,
 * falling back to the first filtered result, clearing on no results — is
 * `useMenuKeyboard`'s own generic `preferredActiveId` option, not
 * anything this file resolves by hand.** `FencedCodeActionsMenu` passes
 * `currentName` straight through as `<Menu preferredActiveId={...}>`; the
 * shared hook has no notion of "language" or "selected" at all, it only
 * ever compares plain DOM element ids against the currently-rendered
 * `[role="menuitem"]` set (see `useMenuKeyboard.ts`'s own doc comment).
 * "What counts as preferred" (`currentName`) stays this file's own
 * business logic — only the *mechanism* for keeping one row resolved to
 * it, including across search-filtering, is shared.
 *
 * **Search matches against `LanguageDescription.alias` — the exact array
 * `codeLanguages`' own fence-info resolution uses — not a second,
 * hand-maintained keyword list.** `LanguageDescription.of` already folds
 * the lowercased canonical name into its own `alias` array (confirmed
 * against the installed `@codemirror/language` source, already cited in
 * `fencedCodeLanguages.ts`), so matching only against `alias` — never
 * `name` separately — covers both without duplicating the check. This is
 * why `js` finds JavaScript (name aliased) and JSX (its own `jsx` alias)
 * with the exact same query.
 *
 * **Exactly one back-navigation control: the language view's own header
 * button.** *Locked.* Clicking it calls `setView('actions')` — it does
 * NOT close the menu. Escape and the backdrop click are deliberately
 * unaffected: both still go straight to `Overlay`'s own `onClose` and
 * fully close the menu from either view, the same as before. There is no
 * dedicated "Back" control in the Actions view itself (Change Language
 * remains the only way in); reopening always lands back on the Actions
 * view regardless (see the render-phase reset below), so a fully-closed
 * menu never resumes on the language view.
 */
export function FencedCodeActionsMenu({
  anchor,
  onClose,
  currentRawInfo,
  onChangeLanguage,
  onFormat,
  onDownload,
  onRemove,
}: FencedCodeActionsMenuProps) {
  const [view, setView] = useState<MenuView>('actions');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Every fresh open must start on the Actions view with an empty search
  // — `FencedCodeActionsMenu` itself never unmounts between opens (only
  // its `Overlay` does), so `view`/`query` would otherwise resume
  // wherever the previous open left off.
  //
  // **Deliberately reset here, during render, not in a `useEffect`.** An
  // effect-based reset (`useEffect(() => { if (anchor) setView('actions')
  // }, [anchor])`, this file's own earlier version) runs *after* React
  // has already committed and painted a frame with the stale `view` —
  // reopening the menu right after leaving it on the language view
  // visibly flashed the language picker for one frame before the effect
  // corrected it a moment later. This is React's own documented pattern
  // for "adjust state when a prop changes, no flash" instead: calling
  // `setState` unconditionally during render, guarded so it only fires on
  // the actual open transition, makes React re-render with the corrected
  // state *before* committing anything to the screen — no intermediate
  // frame with the old view is ever painted.
  // `wasOpen` is `useState`, not `useRef` — React's own rule against
  // reading/writing a ref during render (it isn't part of React's
  // render-phase state model, and can double-fire under Strict Mode's
  // deliberate double-invocation) is exactly why the sanctioned "adjust
  // state during render" pattern tracks the previous value as state.
  const [wasOpen, setWasOpen] = useState(anchor !== null);
  const isOpen = anchor !== null;
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && view !== 'actions') {
      setView('actions');
    }
    if (isOpen && query !== '') {
      setQuery('');
    }
  }

  useEffect(() => {
    if (view === 'language') {
      searchRef.current?.focus();
    }
  }, [view]);

  const normalized = /\S*/.exec((currentRawInfo ?? '').trim())?.[0] ?? '';
  const matched = normalized
    ? LanguageDescription.matchLanguageName(fencedCodeLanguageDescriptions, normalized, true)
    : null;
  const currentName = matched instanceof LanguageDescription ? matched.name : null;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredDescriptions = useMemo(() => {
    if (!normalizedQuery) {
      return fencedCodeLanguageDescriptions;
    }
    return fencedCodeLanguageDescriptions.filter((description) =>
      description.alias.some((alias) => alias.includes(normalizedQuery))
    );
  }, [normalizedQuery]);

  function selectLanguage(name: string) {
    onChangeLanguage?.(name);
    onClose();
  }

  return (
    <Overlay
      open={anchor !== null}
      onClose={onClose}
      anchorRef={(anchor ?? { current: null }) as RefObject<HTMLElement>}
      side="bottom"
      alignment="end"
    >
      <Menu
        size="medium"
        autoFocus={view === 'actions'}
        // `undefined` while on the Actions view — that view's items
        // (Change Language, Download code, Remove) never auto-highlight on
        // open, exactly as before this option existed. While on the
        // language view, this
        // is always either the current language's name or `null` (never
        // omitted), which is what tells `useMenuKeyboard` to actively
        // resolve an active row (current language if still present after
        // filtering, else the first result, else none) instead of leaving
        // `activeId` untouched — see that hook's own doc comment for the
        // full `undefined`-vs-`null`-vs-a-real-id contract this relies on.
        preferredActiveId={view === 'language' ? (currentName ?? null) : undefined}
      >
        {view === 'actions' ? (
          <>
            <MenuItem
              leading={<AppIcon icon="code" />}
              trailing={<AppIcon icon="chevronRight" />}
              onClick={(event) => {
                event.stopPropagation();
                setView('language');
              }}
            >
              Change Language
            </MenuItem>
            {onFormat && (
              <MenuItem
                leading={<AppIcon icon="brush" />}
                onClick={(event) => {
                  event.stopPropagation();
                  onFormat();
                  onClose();
                }}
              >
                Format code
              </MenuItem>
            )}
            <MenuItem
              leading={<AppIcon icon="download" />}
              onClick={(event) => {
                event.stopPropagation();
                onDownload?.();
                onClose();
              }}
            >
              Download code
            </MenuItem>
            <div className="menu__divider" role="separator" />
            <MenuItem
              leading={<AppIcon icon="trash" />}
              onClick={(event) => {
                event.stopPropagation();
                onRemove?.();
                onClose();
              }}
            >
              Remove
            </MenuItem>
          </>
        ) : (
          <LanguagePickerContent
            searchRef={searchRef}
            query={query}
            onQueryChange={setQuery}
            filteredDescriptions={filteredDescriptions}
            currentName={currentName}
            onSelect={selectLanguage}
            onDismiss={() => setView('actions')}
          />
        )}
      </Menu>
    </Overlay>
  );
}

interface LanguagePickerContentProps {
  readonly searchRef: RefObject<HTMLInputElement>;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly filteredDescriptions: readonly LanguageDescription[];
  readonly currentName: string | null;
  readonly onSelect: (name: string) => void;
  /** Returns to the Actions view — does NOT close the whole menu. Escape/the backdrop still close the whole menu directly (`Overlay`'s own `onClose`, unaffected). */
  readonly onDismiss: () => void;
}

/**
 * Rendered as `Menu`'s own child — `useMenuContext()` (the same hook
 * `MenuItem` itself calls) is only reachable from inside `Menu`'s own
 * `MenuContext.Provider`, which is why this can't be inlined into
 * `FencedCodeActionsMenu`'s own render body one level up.
 */
function LanguagePickerContent({
  searchRef,
  query,
  onQueryChange,
  filteredDescriptions,
  currentName,
  onSelect,
  onDismiss,
}: LanguagePickerContentProps) {
  // `setActiveId` is intentionally not destructured here — resolving the
  // active row (preferring `currentName`, falling back to the first
  // filtered result, clearing on no results) is now `useMenuKeyboard`'s
  // own generic `preferredActiveId` mechanism, driven by the prop
  // `FencedCodeActionsMenu` passes to `<Menu>` above. This component only
  // needs to *read* `activeId`, for the `Search` input's own
  // `aria-activedescendant`.
  const { activeId } = useMenuContext();

  return (
    <>
      <MenuTitle
        trailing={
          <Button
            aria-label="Back to actions"
            onClick={onDismiss}
            isIconOnly
            variant="ghost"
            interaction="subtle"
            size="small"
          >
            <AppIcon icon="dismiss" />
          </Button>
        }
      >
        Change Language
      </MenuTitle>

      <Search
        ref={searchRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          // `useMenuKeyboard` treats Space as "activate the current
          // item" — correct for a non-text-input menu, but this input
          // must keep Space as a literal character (e.g. searching
          // "Objective C"). Stopping propagation here keeps it from
          // reaching `Menu`'s own `onKeyDown` (a sibling/ancestor
          // synthetic listener); every other key (ArrowUp/Down/Home/
          // End/Enter) is deliberately left to bubble there unchanged —
          // `Search` is a real DOM child of `Menu`'s own container, so
          // native bubbling delivers them without any manual forwarding.
          if (event.key === ' ') {
            event.stopPropagation();
          }
        }}
        // `Menu`'s own container also carries `aria-activedescendant`
        // unconditionally (unchanged) — but real DOM focus lives here
        // while this view is showing, so this input carries it too,
        // matching `FolderPicker.tsx`'s own established convention for
        // exactly this shape (a focused text input virtually owning a
        // list below it), not a newly-invented pattern.
        aria-activedescendant={activeId}
        placeholder="Search languages"
      />

      {/* Capped independently of `.menu`'s own `max-height` (which still
          bounds the whole menu, title/search included) — `MenuItem`'s
          `useMenuKeyboard` lookup queries by `[role="menuitem"]` via
          `querySelectorAll`, so this extra wrapper doesn't affect keyboard
          navigation at all. */}
      <div className="fenced-code-language-picker__list">
        {filteredDescriptions.map((description) => (
          <MenuItem
            key={description.name}
            id={description.name}
            selected={description.name === currentName}
            onClick={() => onSelect(description.name)}
          >
            {description.name}
          </MenuItem>
        ))}
        {filteredDescriptions.length === 0 && (
          <div className="fenced-code-language-picker__empty">No matching languages</div>
        )}
      </div>
    </>
  );
}
