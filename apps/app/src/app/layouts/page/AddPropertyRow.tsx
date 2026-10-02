import { useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { Entry } from '@components/entry/Entry';
import { Menu } from '@components/menu/Menu';
import { Overlay } from '@components/overlay/Overlay';
import type { CustomPropertyType } from '@core/properties/Property.types';
import { AppIcon } from '@shared/icon';

import { AddPropertyMenu } from './header/AddPropertyMenu';
import type { AddableSystemProperty, HiddenPropertyOption } from './header/AddPropertyMenu';

import './AddPropertyRow.css';

interface AddPropertyRowProps {
  /** What the menu offers besides new types — see AddPropertyMenu. */
  systemProperties?: readonly AddableSystemProperty[];
  hiddenProperties?: readonly HiddenPropertyOption[];
  /** Shows an existing property (its canonical key). */
  onShowProperty?(key: string): void;
  /** Adds a new, unnamed custom property of the chosen type; its name field takes focus next. */
  onAddCustomProperty(type: CustomPropertyType): void;
}

/**
 * The Properties list's "+ Add a property" row: it always ends the list,
 * and clicking it opens the Add properties menu (AddPropertyMenu) anchored
 * to it. The row itself never changes — no replaced label, no blank or
 * draft row, no input — so it stays visually stable at all times.
 *
 * - Choosing an existing property (a system one, or a hidden custom one)
 *   shows it.
 * - Choosing a new custom type starts the draft custom property: its row
 *   appears above this one with the type's icon and a focused "Property
 *   name" field (see PropertyList's not-yet-named rows).
 * - Dismissing the menu (Escape, a click outside) changes nothing.
 *
 * The menu closing after a choice never returns focus to this row, so a
 * draft's name field keeps the focus it just took.
 *
 * Beside it sits a "…" More actions button that opens an empty menu — a
 * placeholder for actions to come; it does nothing else.
 */
export function AddPropertyRow({
  systemProperties,
  hiddenProperties,
  onShowProperty,
  onAddCustomProperty,
}: AddPropertyRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // The "…" button's own, still empty, menu.
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  // Set for the one closing that follows a choice (see the doc comment).
  const suppressReturnFocusRef = useRef(false);

  function finishWithChoice() {
    suppressReturnFocusRef.current = true;
    setIsOpen(false);
  }

  return (
    <>
      <div ref={rowRef} className="property-list__row property-list__add-row">
        <Entry
          className="property-list__name"
          leading={<AppIcon className="property__icon" icon="plus" />}
          onClick={() => {
            suppressReturnFocusRef.current = false;
            setIsOpen(true);
          }}
        >
          <span>Add a property</span>
        </Entry>
        <Button
          className="property-list__add-row-more"
          ref={moreRef}
          variant="ghost"
          size="small"
          isIconOnly
          aria-haspopup="menu"
          aria-expanded={isMoreOpen}
          aria-label="More property actions"
          onClick={() => setIsMoreOpen((value) => !value)}
        >
          <AppIcon icon="moreHorizontal" />
        </Button>
      </div>
      <Overlay
        open={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        anchorRef={moreRef}
        side="bottom"
        alignment="start"
      >
        {/* No actions yet: the menu is deliberately empty. */}
        <Menu size="medium" aria-label="More property actions">{null}</Menu>
      </Overlay>
      <Overlay
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={rowRef}
        side="bottom"
        alignment="start"
        suppressReturnFocusRef={suppressReturnFocusRef}
      >
        <AddPropertyMenu
          systemProperties={systemProperties}
          hiddenProperties={hiddenProperties}
          onShowProperty={
            onShowProperty &&
            ((key) => {
              finishWithChoice();
              onShowProperty(key);
            })
          }
          onAddCustomProperty={(type) => {
            finishWithChoice();
            onAddCustomProperty(type);
          }}
        />
      </Overlay>
    </>
  );
}
