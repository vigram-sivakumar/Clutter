import { useRef, useState } from 'react';

import { Entry } from '@components/entry/Entry';
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
 * The Properties list's "+ Add properties" row, and the first step of
 * adding one:
 *
 * - at rest it is the row `+ Add properties`;
 * - clicking it swaps it for a blank row — no visible icon (its slot stays
 *   reserved, so the text doesn't move), the placeholder "New property",
 *   nothing focused — and opens the Add properties menu
 *   (AddPropertyMenu) anchored to that row;
 * - choosing an existing property shows it, and choosing a new custom type
 *   hands over to the draft row (a typed icon and a focused "Property
 *   name" field — see PropertyList's not-yet-named rows); either way this
 *   row goes back to rest, and the menu closing never takes focus back;
 * - dismissing the menu (Escape, a click outside) removes the blank row and
 *   restores `+ Add properties`, writing nothing.
 *
 * The blank row exists only here, as UI state: nothing is persisted until
 * a property is actually chosen (and, for a new one, named).
 */
export function AddPropertyRow({
  systemProperties,
  hiddenProperties,
  onShowProperty,
  onAddCustomProperty,
}: AddPropertyRowProps) {
  const [isPending, setIsPending] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // Set for the one closing that follows a choice: the row that appears (a
  // shown property, or the draft's name field) must keep focus, not have
  // it returned to this row.
  const suppressReturnFocusRef = useRef(false);

  function finishWithChoice() {
    suppressReturnFocusRef.current = true;
    setIsPending(false);
  }

  if (!isPending) {
    return (
      <div className="property-list__row property-list__add-row">
        <Entry
          className="property-list__name"
          leading={<AppIcon className="property__icon" icon="plus" />}
          onClick={() => {
            suppressReturnFocusRef.current = false;
            setIsPending(true);
          }}
        >
          <span>Add properties</span>
        </Entry>
      </div>
    );
  }

  return (
    <>
      <div ref={rowRef} className="property-list__row property-list__add-row">
        <Entry
          className="property-list__name"
          // The "+" icon's own slot, kept but invisible: the same icon in the
          // same leading slot, so the text starts exactly where it did at
          // rest and where the draft's type icon will put it.
          leading={<AppIcon className="property__icon property__icon--reserved" icon="plus" />}
        >
          <span className="property-list__name-placeholder">New property</span>
        </Entry>
      </div>
      <Overlay
        open
        onClose={() => setIsPending(false)}
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
