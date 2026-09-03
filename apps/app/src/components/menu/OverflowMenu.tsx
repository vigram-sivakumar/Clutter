import { useId, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';

import { Button } from '@components/button/Button';
import { ButtonProps } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import type {
  OverlaySide,
  OverlayAlignment,
} from '@components/overlay/Overlay.types';
import { AppIcon } from '@shared/icon';
import type { SystemIcon } from '@shared/icon';

import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

export interface OverflowMenuSubmenuItemConfig {
  id: string;
  label: string;
  /** Rendered but non-interactive — never omitted from the submenu. */
  disabled?: boolean;
}

export interface OverflowMenuItemConfig {
  id: string;
  label: string;
  icon: SystemIcon;
  /** Rendered but non-interactive — never omitted from the menu. */
  disabled?: boolean;
  /**
   * This item's own selection immediately mounts and focuses a different
   * element (e.g. an inline `EditableText` for a "Rename" action) — the
   * menu closing must NOT then restore focus back to the trigger button
   * the way it normally would, or the just-focused element gets blurred
   * out from under it a moment later. See `useOverlayFocus`'s doc comment
   * for the full mechanism this flag drives.
   */
  opensInlineEdit?: boolean;
  /**
   * Renders this item as a submenu trigger instead of an immediately
   * selectable action: clicking it opens a nested menu of these leaf
   * items anchored beside it, while this (parent) menu stays open. Leaf
   * selection dispatches through the same `onSelect(id)`/close-the-whole-
   * menu path as an ordinary top-level item — the submenu is a
   * presentation detail, not a second dispatch mechanism.
   */
  submenu?: OverflowMenuSubmenuItemConfig[];
}

export interface OverflowMenuProps {
  items: readonly OverflowMenuItemConfig[];
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(id: string): void;
  buttonSize?: 'small' | 'medium' | 'large';
  size?: 'medium' | 'small';
  side?: OverlaySide;
  alignment?: OverlayAlignment;
  triggerRef?: RefObject<HTMLButtonElement>;

  buttonProps?: Omit<
    ButtonProps,
    | 'children'
    | 'ref'
    | 'onClick'
    | 'aria-haspopup'
    | 'aria-expanded'
    | 'isIconOnly'
  >;
}

/**
 * The "⋯" trigger button plus its anchored Overlay/Menu — the one place
 * that composes those three primitives into a row-level overflow control.
 * `open` is controlled by the caller so multiple OverflowMenu instances
 * (e.g. one per sidebar row) can share a single "which one is open" owner
 * and guarantee only one is ever open at a time.
 *
 * The actual `<Menu>`/item/submenu rendering lives in `OverflowMenuBody`
 * (below, also exported) — split out so a caller that needs this exact
 * menu body (items, submenus, keyboard/focus behavior, all of it) behind a
 * *different* trigger button than this component's own hardcoded "⋯"
 * `Button` can reuse it directly instead of re-implementing the submenu/
 * keyboard logic a second time. `ImageOverlayMoreActions.tsx` is the first
 * such caller — its trigger must pixel-match the Markdown editor's inline
 * image controls (`.cm-image-control`), which this component's own
 * `Button`-based trigger can't be reshaped into safely (see that file's own
 * doc comment).
 */
export function OverflowMenu({
  items,
  open,
  onOpenChange,
  onSelect,
  buttonSize = 'small',
  size = 'medium',
  side = 'bottom',
  alignment = 'end',
  buttonProps,
  triggerRef,
}: OverflowMenuProps) {
  // Called unconditionally, before the items.length early return below —
  // a component instance can transition between an empty and non-empty
  // item list across renders (e.g. a draft note's row, once persisted,
  // goes from no capabilities to a real menu without unmounting), and a
  // hook called only on some renders violates the Rules of Hooks.
  const internalAnchorRef = useRef<HTMLButtonElement>(null);
  const anchorRef: RefObject<HTMLButtonElement> =
    triggerRef ?? internalAnchorRef;
  // See useOverlayFocus's own doc comment — set true for exactly the one
  // closing transition triggered by an `opensInlineEdit` item, consumed
  // (reset) by that hook the moment it observes it.
  const suppressReturnFocusRef = useRef(false);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <Button
        size={buttonSize}
        variant="ghost"
        interaction="subtle"
        isIconOnly
        {...buttonProps}
        ref={anchorRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
      >
        <AppIcon icon={'moreVertical'} />
      </Button>
      <Overlay
        open={open}
        onClose={() => onOpenChange(false)}
        anchorRef={anchorRef}
        side={side}
        alignment={alignment}
        suppressReturnFocusRef={suppressReturnFocusRef}
      >
        <OverflowMenuBody
          items={items}
          size={size}
          onSelect={onSelect}
          onOpenChange={onOpenChange}
          suppressReturnFocusRef={suppressReturnFocusRef}
        />
      </Overlay>
    </>
  );
}

export interface OverflowMenuBodyProps {
  items: readonly OverflowMenuItemConfig[];
  size?: 'medium' | 'small';
  onSelect(id: string): void;
  onOpenChange(open: boolean): void;
  /** See OverflowMenuProps/useOverlayFocus's own doc comments — forwarded straight through to each item's onClick. */
  suppressReturnFocusRef: MutableRefObject<boolean>;
}

/**
 * The `<Menu>` + item/submenu rendering `OverflowMenu` itself wraps in its
 * own `Button`+`Overlay` — pulled out so a caller with its own trigger
 * button can mount this directly inside its own `Overlay`, getting the
 * exact same items/submenu/keyboard/focus behavior `OverflowMenu` gives
 * every other caller, with zero duplicated logic. Only ever meant to be
 * rendered as an `Overlay`'s child (its own submenu-open state depends on
 * mounting fresh each time the menu opens — see `openSubmenuId` below) —
 * `OverflowMenu` itself is still the right choice for any caller that's
 * fine with the standard "⋯" trigger.
 */
export function OverflowMenuBody({
  items,
  size = 'medium',
  onSelect,
  onOpenChange,
  suppressReturnFocusRef,
}: OverflowMenuBodyProps) {
  // Held so an open submenu can return keyboard ownership to this menu's
  // own container (ArrowLeft, Escape, hovering away, ...) — see
  // OverflowSubmenuTrigger's Overlay below.
  const parentMenuRef = useRef<HTMLDivElement>(null);
  // Item ids are only stable across renders (React's own useId() is
  // per-component-instance, generated inside MenuItem itself, and not
  // knowable up here) — ArrowRight needs to resolve the currently active
  // *DOM* id back to "which item config is this", so every item gets an
  // explicit, predictable id instead.
  const instanceId = useId();
  const menuItemDomId = (itemId: string) => `${instanceId}-${itemId}`;
  // Which item's submenu (if any) is currently open — at most one at a
  // time. No separate "reset on parent close" effect is needed the way an
  // earlier revision of this file (before the OverflowMenu/OverflowMenuBody
  // split) had one: this component only ever exists while its own Overlay
  // is open (Overlay returns null and unmounts its children when closed),
  // so a fresh `OverflowMenuBody` instance — and therefore fresh,
  // undefined `openSubmenuId` state — is exactly what the next open
  // already produces on its own.
  const [openSubmenuId, setOpenSubmenuId] = useState<string | undefined>(
    undefined
  );

  return (
    <Menu
      size={size}
      menuRef={parentMenuRef}
      onArrowRight={(activeId) => {
        const item = items.find(
          (candidate) =>
            candidate.submenu && menuItemDomId(candidate.id) === activeId
        );
        if (item) {
          setOpenSubmenuId(item.id);
        }
      }}
    >
      {items.map((item) =>
        item.submenu ? (
          <OverflowSubmenuTrigger
            key={item.id}
            id={menuItemDomId(item.id)}
            item={item}
            submenu={item.submenu}
            isOpen={openSubmenuId === item.id}
            onOpenSubmenu={() => setOpenSubmenuId(item.id)}
            onCloseSubmenu={() => setOpenSubmenuId(undefined)}
            onSelectLeaf={(leafId) => {
              onSelect(leafId);
              onOpenChange(false);
            }}
            parentMenuRef={parentMenuRef}
          />
        ) : (
          <MenuItem
            key={item.id}
            id={menuItemDomId(item.id)}
            disabled={item.disabled}
            // Hovering any non-submenu item closes an open submenu —
            // otherwise it would stay open, anchored to a row the
            // pointer has moved away from, while this item's own hover
            // state (via Menu.context's setActiveId, already wired
            // inside MenuItem) takes over.
            onMouseEnter={() => setOpenSubmenuId(undefined)}
            onClick={(event) => {
              // Overlay renders this menu through a DOM portal (to
              // document.body), but React still bubbles the click event
              // through the *React* tree — up through this OverflowMenu
              // into whatever row rendered it (e.g. a sidebar Note/
              // Folder row's own Entry). That row's Entry.handleClick
              // guards against a nested interactive element using a real
              // DOM `closest()` walk, which can never find the row's own
              // DOM node as an ancestor of a portaled element, so it
              // never catches this case. Without stopping propagation
              // here, selecting any menu item (Rename, Duplicate,
              // Delete, ...) would also fire the row's own onClick and
              // open/select it — exactly the trigger button beside this
              // menu already guards against for opening the menu itself.
              event.stopPropagation();

              if (item.opensInlineEdit) {
                suppressReturnFocusRef.current = true;
              }

              onSelect(item.id);
              onOpenChange(false);
            }}
            leading={item.icon ? <AppIcon icon={item.icon} /> : undefined}
          >
            {item.label}
          </MenuItem>
        )
      )}
    </Menu>
  );
}

/**
 * A submenu-trigger row (e.g. "Copy path ›") plus its own nested
 * Overlay+Menu, anchored to this row itself and opened on hover (also on
 * click, for a mouse user who clicks without pausing to hover first).
 * Hovering any *other* item in the parent menu closes it again — see that
 * item's own `onMouseEnter` above. Rendered
 * with `backdrop={false}` — unlike the parent `OverflowMenu`'s own Overlay
 * — so it never covers/intercepts clicks on the parent menu's other items;
 * the parent's own backdrop is still there to close everything (this
 * submenu included, via the `openSubmenuId` reset above) on an actual
 * outside click. This keeps the parent menu visibly open and interactive
 * while the submenu is open, per the sidebar "Copy path" design.
 *
 * Keyboard ownership is handed off explicitly rather than assumed from
 * hover: this trigger's own `id` is what the parent Menu's `onArrowRight`
 * resolves against, and the submenu's `<Menu>` below hands focus straight
 * back to the parent (via `returnFocusRef={parentMenuRef}`) the moment it
 * closes for *any* reason — ArrowLeft, Escape, a leaf selection, or
 * hovering a different parent item — so keyboard focus is never dropped
 * onto `document.body` (and from there, whatever the page's own default
 * Up/Down scroll behavior would otherwise land on).
 */
function OverflowSubmenuTrigger({
  id,
  item,
  submenu,
  isOpen,
  onOpenSubmenu,
  onCloseSubmenu,
  onSelectLeaf,
  parentMenuRef,
}: {
  id: string;
  item: OverflowMenuItemConfig;
  submenu: readonly OverflowMenuSubmenuItemConfig[];
  isOpen: boolean;
  onOpenSubmenu(): void;
  onCloseSubmenu(): void;
  onSelectLeaf(id: string): void;
  parentMenuRef: RefObject<HTMLDivElement>;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={anchorRef}>
      <MenuItem
        id={id}
        disabled={item.disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        // Opens on hover, not just click — the mouse moving onto this row
        // is enough; a disabled item still gets Entry's own disabled guard
        // (no onClick fires from a real click), but hover has no such
        // built-in guard, so the disabled check here mirrors it.
        onMouseEnter={() => {
          if (!item.disabled) {
            onOpenSubmenu();
          }
        }}
        onClick={(event) => {
          // Same portal-bubbling guard as an ordinary item's onClick above
          // — this click must never reach the row that rendered this menu.
          // Kept alongside onMouseEnter for mouse users who click without
          // pausing to hover first (e.g. a fast double-click-ish tap).
          event.stopPropagation();
          onOpenSubmenu();
        }}
        leading={item.icon ? <AppIcon icon={item.icon} /> : undefined}
        trailing={<AppIcon icon="chevronRight" />}
      >
        {item.label}
      </MenuItem>
      <Overlay
        open={isOpen}
        onClose={onCloseSubmenu}
        anchorRef={anchorRef}
        backdrop={false}
        side="right"
        alignment="start"
        returnFocusRef={parentMenuRef}
      >
        <Menu size="small" onArrowLeft={onCloseSubmenu}>
          {submenu.map((leaf) => (
            <MenuItem
              key={leaf.id}
              disabled={leaf.disabled}
              onClick={(event) => {
                event.stopPropagation();
                onSelectLeaf(leaf.id);
              }}
            >
              {leaf.label}
            </MenuItem>
          ))}
        </Menu>
      </Overlay>
    </div>
  );
}
