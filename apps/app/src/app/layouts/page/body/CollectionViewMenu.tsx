import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

import type {
  CollectionViewMode,
  CollectionPropertyVisibility,
  CollectionSortState,
  CollectionSortKey,
} from './CollectionBody';

export interface CollectionViewMenuProps {
  viewMode: CollectionViewMode;
  onChange: (mode: CollectionViewMode) => void;
  properties: CollectionPropertyVisibility;
  onPropertiesChange: (next: CollectionPropertyVisibility) => void;
  sort: CollectionSortState;
  onSortChange: (next: CollectionSortState) => void;
}

const VIEW_ITEMS: ReadonlyArray<{
  mode: CollectionViewMode;
  label: string;
  icon: SystemIcon;
}> = [
  { mode: 'list', label: 'List', icon: 'multiLine' },
  { mode: 'table', label: 'Table', icon: 'table' },
];

const PROPERTY_ITEMS: ReadonlyArray<{
  key: keyof CollectionPropertyVisibility;
  label: string;
}> = [
  { key: 'description', label: 'Description' },
  { key: 'lastOpened', label: 'Last opened' },
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
];

// Deliberately the same labels as PROPERTY_ITEMS (Name is the one
// exception, Properties has no such field) — the product spec is
// explicit that Sort by reuses the existing Properties labels verbatim,
// not "Last Viewed"/"Date Created"/"Date Updated".
const SORT_ITEMS: ReadonlyArray<{ key: CollectionSortKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'lastOpened', label: 'Last opened' },
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
];

type ConfigureMenuView = 'root' | 'properties';

/**
 * The collection List/Table/Properties/Sort-by control — lives beside the
 * page title (PageTitleSection's `actions` slot), not the top bar.
 *
 * Properties is a nested/replacement view, not a second floating menu —
 * one shared `<Menu>`, its children swapped by `view` state, exactly the
 * pattern FencedCodeActionsMenu.tsx's Change Language view established
 * (see that file's own, extensively documented comment for the full
 * rationale — this reuses it rather than inventing a second navigation
 * mechanism):
 *
 *  - The render-phase `view` reset on reopen (`wasOpen` compared during
 *    render, not in a `useEffect`) — an effect-based reset would commit
 *    and paint one stale frame (the Properties view flashing) before
 *    correcting itself a moment later; this way React corrects the state
 *    before anything is ever painted.
 *  - Exactly one back-navigation control, the submenu's own header
 *    button — clicking it returns to the root view, it does NOT close
 *    the menu. Escape and the backdrop are unaffected: both still go
 *    straight to `Overlay`'s own `onClose` and close the whole menu from
 *    either view.
 *  - `MenuGroupTitle`'s `trailing` slot holds that back control, the
 *    same slot and the same dismiss icon FencedCodeActionsMenu's own
 *    "Back to actions" button already uses — not a new affordance.
 *
 * Unlike the fenced-code language view, there's no search input here, so
 * none of that file's focus-juggling (`autoFocus={view === 'actions'}`,
 * a `Search` ref, `aria-activedescendant` mirrored onto it) applies —
 * `Menu`'s own default focus/keyboard handling already covers a plain
 * list of `MenuItem`s in both views unchanged.
 *
 * The trigger icon is `configure` (svg/configure.svg).
 */
export function CollectionViewMenu({
  viewMode,
  onChange,
  properties,
  onPropertiesChange,
  sort,
  onSortChange,
}: CollectionViewMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ConfigureMenuView>('root');
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Every fresh open must start on the root view — CollectionViewMenu
  // itself never unmounts between opens (only its Overlay does), so
  // `view` would otherwise resume wherever the previous open left off.
  // See this component's own doc comment for why this runs during
  // render rather than in a `useEffect`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && view !== 'root') {
      setView('root');
    }
  }

  return (
    <>
      <Button
        className="page-title__button-outline-fill"
        ref={anchorRef}
        size="large"
        variant="outline-fill"
        isIconOnly
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <AppIcon icon="configure" />
      </Button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        side="bottom"
        alignment="end"
      >
        <Menu size="medium">
          {view === 'root' ? (
            <>
              <MenuGroupTitle>Layout</MenuGroupTitle>
              {VIEW_ITEMS.map(({ mode, label, icon }) => (
                <MenuItem
                  key={mode}
                  selected={mode === viewMode}
                  leading={<AppIcon icon={icon} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(mode);
                    setOpen(false);
                  }}
                >
                  {label}
                </MenuItem>
              ))}
              <div className="menu__divider" role="separator" />
              <MenuItem
                trailing={<AppIcon icon="chevronRight" />}
                onClick={(event) => {
                  event.stopPropagation();
                  setView('properties');
                }}
              >
                Properties
              </MenuItem>
              <div className="menu__divider" role="separator" />
              <MenuGroupTitle>Sort by</MenuGroupTitle>
              {SORT_ITEMS.map(({ key, label }) => {
                const isActive = sort.key === key;

                return (
                  <MenuItem
                    key={key}
                    leading={
                      isActive ? (
                        <AppIcon icon="tick" />
                      ) : (
                        <span className="app-icon" />
                      )
                    }
                    // Only the active row gets a direction arrow — unlike
                    // Properties' leading tick, there's exactly one active
                    // Sort-by row at a time, so no other row ever needs a
                    // placeholder to keep its label from shifting.
                    trailing={
                      isActive ? (
                        <AppIcon
                          icon={sort.direction === 'down' ? 'arrowDown' : 'arrowUp'}
                        />
                      ) : undefined
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      // Re-clicking the already-active option flips its
                      // direction; picking a different option activates it
                      // at its own default ('down' — A→Z for Name, newest-
                      // first for the three date keys, per
                      // sortCollectionEntries' own doc comment).
                      onSortChange(
                        isActive
                          ? {
                              key,
                              direction: sort.direction === 'down' ? 'up' : 'down',
                            }
                          : { key, direction: 'down' }
                      );
                    }}
                  >
                    {label}
                  </MenuItem>
                );
              })}
            </>
          ) : (
            <>
              <MenuGroupTitle
                trailing={
                  <Button
                    aria-label="Back to Configure"
                    onClick={() => setView('root')}
                    isIconOnly
                    variant="ghost"
                    interaction="subtle"
                    size="small"
                  >
                    <AppIcon icon="dismiss" />
                  </Button>
                }
              >
                Properties
              </MenuGroupTitle>
              <div className="menu__divider" role="separator" />
              {PROPERTY_ITEMS.map(({ key, label }) => {
                const checked = properties[key];
                // Toggling a property doesn't close the menu (unlike a
                // Layout selection) — these are independent on/off
                // preferences a user plausibly sets several of in one
                // sitting, not a single mutually-exclusive choice.
                const toggle = () =>
                  onPropertiesChange({ ...properties, [key]: !checked });

                return (
                  <MenuItem
                    key={key}
                    // A tick icon when checked, an empty `.app-icon`-sized
                    // span when not — always a non-null `leading` so
                    // Entry's own `.entry__leading` wrapper renders at the
                    // same fixed width either way (AppIcon's own sizing
                    // class, reused rather than inventing a second one),
                    // so toggling never shifts the label.
                    leading={
                      checked ? (
                        <AppIcon icon="tick" />
                      ) : (
                        <span className="app-icon" />
                      )
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle();
                    }}
                  >
                    {label}
                  </MenuItem>
                );
              })}
            </>
          )}
        </Menu>
      </Overlay>
    </>
  );
}
