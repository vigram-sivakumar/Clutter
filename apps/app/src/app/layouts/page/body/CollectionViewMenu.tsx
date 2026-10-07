import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';
import { propertyLabel, type PropertyId } from '@core/properties/collectionProperties';
import type { CollectionSort } from '@core/properties/collectionSort';
import type { CollectionLayout } from '@core/properties/collectionViewConfig';
import type { ResolvedCollectionView } from '@core/presentation/collection/resolveCollectionView';

export interface CollectionViewMenuProps {
  /**
   * The collection's resolved view (`resolveCollectionView`) — the ONE thing every row below is
   * read from. Properties lists `view.available`; Sort by lists `view.sortable`, which is the
   * same list filtered to the properties that can be sorted; neither has a list of its own.
   */
  view: ResolvedCollectionView;
  onLayoutChange: (layout: CollectionLayout) => void;
  /** The user turned a (non-locked) property on or off. */
  onPropertyChange: (id: PropertyId, visible: boolean) => void;
  onSortChange: (next: CollectionSort) => void;
  /**
   * Extra on/off preferences a collection offers beyond Layout / Properties / Sort by — drawn as
   * their own tick rows after Sort by (All Tasks' Show completed / Auto-sort completed). Absent or
   * empty: the menu is exactly the standard one. Like a property toggle, flipping one does not
   * close the menu.
   */
  toggles?: readonly CollectionViewToggle[];
}

export interface CollectionViewToggle {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

const VIEW_ITEMS: ReadonlyArray<{
  mode: CollectionLayout;
  label: string;
  icon: SystemIcon;
}> = [
  { mode: 'list', label: 'List', icon: 'multiLine' },
  { mode: 'table', label: 'Table', icon: 'table' },
  { mode: 'card', label: 'Card', icon: 'card' },
];

type ConfigureMenuView = 'root' | 'properties';

/**
 * The collection List/Table/Properties/Sort-by control — lives beside the
 * page title (PageTitleSection's `actions` slot), not the top bar.
 *
 * Properties is a nested/replacement view, not a second floating menu —
 * one shared `<Menu>`, its children swapped by `panel` state, exactly the
 * pattern FencedCodeActionsMenu.tsx's Change Language view established
 * (see that file's own, extensively documented comment for the full
 * rationale — this reuses it rather than inventing a second navigation
 * mechanism):
 *
 *  - The render-phase `panel` reset on reopen (`wasOpen` compared during
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
 * The rows themselves are never decided here. The root view's Layout rows are
 * `view.layouts`, Properties is `view.available` (with the layout's required ones locked)
 * and Sort by is `view.sortable` — the same properties, the same labels (the
 * registry's), the same canonical order, filtered to the ones that can be sorted.
 *
 * The trigger icon is `settings` (svg/settings.svg).
 */
export function CollectionViewMenu({ view, onLayoutChange, onPropertyChange, onSortChange, toggles }: CollectionViewMenuProps) {
  const { sort } = view;
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<ConfigureMenuView>('root');
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Every fresh open must start on the root view — CollectionViewMenu
  // itself never unmounts between opens (only its Overlay does), so
  // `panel` would otherwise resume wherever the previous open left off.
  // See this component's own doc comment for why this runs during
  // render rather than in a `useEffect`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && panel !== 'root') {
      setPanel('root');
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
        <AppIcon icon="settings" />
      </Button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        side="bottom"
        alignment="end"
      >
        <Menu size="medium">
          {panel === 'root' ? (
            <>
              <MenuGroupTitle>Layout</MenuGroupTitle>
              {VIEW_ITEMS.filter(({ mode }) => view.layouts.includes(mode)).map(({ mode, label, icon }) => (
                <MenuItem
                  key={mode}
                  selected={mode === view.layout}
                  leading={<AppIcon icon={icon} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onLayoutChange(mode);
                    setOpen(false);
                  }}
                >
                  {label}
                </MenuItem>
              ))}
              {view.available.length > 0 && (
                <>
                  <div className="menu__divider" role="separator" />
                  <MenuItem
                    trailing={<AppIcon icon="chevronRight" />}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPanel('properties');
                    }}
                  >
                    Properties
                  </MenuItem>
                </>
              )}
              {view.sortable.length > 0 && (
                <>
                  <div className="menu__divider" role="separator" />
                  <MenuGroupTitle>Sort by</MenuGroupTitle>
                </>
              )}
              {view.sortable.map((key) => {
                const isActive = sort.property === key;

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
                          className="menu__item-indicator"
                        />
                      ) : undefined
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      // Re-clicking the already-active option flips its
                      // direction; picking a different option activates it
                      // at its own default ('down' — A→Z for Name, newest-
                      // first for the three date keys, per
                      // `sortEntries`' own doc comment).
                      onSortChange(
                        isActive
                          ? {
                              property: key,
                              direction: sort.direction === 'down' ? 'up' : 'down',
                            }
                          : { property: key, direction: 'down' }
                      );
                    }}
                  >
                    {propertyLabel(key)}
                  </MenuItem>
                );
              })}
              {toggles && toggles.length > 0 && (
                <>
                  <div className="menu__divider" role="separator" />
                  <MenuGroupTitle>Display</MenuGroupTitle>
                  {toggles.map((toggle) => (
                    <MenuItem
                      key={toggle.id}
                      // Same tick / same-width placeholder as the Properties rows, so labels never shift.
                      leading={toggle.checked ? <AppIcon icon="tick" /> : <span className="app-icon" />}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle.onChange(!toggle.checked);
                      }}
                    >
                      {toggle.label}
                    </MenuItem>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <MenuGroupTitle
                trailing={
                  <Button
                    aria-label="Back to Configure"
                    onClick={() => setPanel('root')}
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
              {view.available.map((id) => {
                const checked = view.visible.includes(id);
                // A property the current layout requires (the name, for a list or a table) is
                // shown ticked and cannot be turned off — the resolver guarantees it stays
                // visible whatever is stored; the disabled row is just that, said out loud.
                const locked = view.locked.includes(id);
                // Toggling a property doesn't close the menu (unlike a
                // Layout selection) — these are independent on/off
                // preferences a user plausibly sets several of in one
                // sitting, not a single mutually-exclusive choice.
                const toggle = () => onPropertyChange(id, !checked);

                return (
                  <MenuItem
                    key={id}
                    disabled={locked}
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
                    {propertyLabel(id)}
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
