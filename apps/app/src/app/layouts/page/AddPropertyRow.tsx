import { useEffect, useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { Entry } from '@components/entry/Entry';
import { Input } from '@components/input/Input';
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
  /**
   * The title's "Properties" starts here: the row is the empty property,
   * with the menu open on it as soon as it mounts. Dismissing the menu
   * calls `onDismiss`, and the host takes it away.
   */
  autoOpen?: boolean;
  /** The menu was dismissed without a choice. */
  onDismiss?(): void;
  /** The menu's "Hide Properties" and "Remove all" actions — see AddPropertyMenu. Each closes the menu first. */
  onHideProperties?(): void;
  onRemoveAll?(): void;
}

/**
 * The Properties list's "+ Add a property" button: it always ends the list.
 * Clicking it turns it into an empty property — an info icon, a "New
 * property" name placeholder and an empty value field — with the Add
 * properties menu (AddPropertyMenu) open on it; the title's "Properties"
 * starts the same experience (`autoOpen`).
 *
 * - Choosing an existing property (a system one, or a hidden custom one)
 *   shows it.
 * - Choosing a new custom type starts the draft custom property: its row
 *   appears above this one with the type's icon and a focused "Property
 *   name" field (see PropertyList's not-yet-named rows).
 * - Dismissing the menu (Escape, a click outside) changes nothing: the
 *   row is "+ Add a property" again.
 *
 * The menu closing after a choice never returns focus to this row, so a
 * draft's name field keeps the focus it just took.
 */
export function AddPropertyRow({
  systemProperties,
  hiddenProperties,
  onShowProperty,
  onAddCustomProperty,
  autoOpen = false,
  onDismiss,
  onHideProperties,
  onRemoveAll,
}: AddPropertyRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  // After mount, so the menu's anchor (the row) exists.
  useEffect(() => {
    if (autoOpen) setIsOpen(true);
  }, [autoOpen]);
  const rowRef = useRef<HTMLDivElement>(null);
  // Set for the one closing that follows a choice (see the doc comment).
  const suppressReturnFocusRef = useRef(false);

  function finishWithChoice() {
    suppressReturnFocusRef.current = true;
    setIsOpen(false);
  }

  const menu = (
    <Overlay
      open={isOpen}
      onClose={() => {
        setIsOpen(false);
        onDismiss?.();
      }}
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
        onHideProperties={
          onHideProperties &&
          (() => {
            finishWithChoice();
            onHideProperties();
          })
        }
        onRemoveAll={
          onRemoveAll &&
          (() => {
            finishWithChoice();
            onRemoveAll();
          })
        }
      />
    </Overlay>
  );

  // The row is an empty property while its menu is open, however it was
  // started: from the title (`autoOpen`) or by clicking the row itself.
  if (autoOpen || isOpen) {
    return (
      <>
        <div ref={rowRef} className="property-list__row property-list__new-row">
          <Entry
            className="property-list__name"
            leading={<AppIcon className="property__icon" icon="info" />}
          >
            <span className="property-list__placeholder">New property</span>
          </Entry>
          {/* The same value field an empty property's row has, inert and with no placeholder text. */}
          <Input
            className="property-list__value property-list__input property-list__text-input"
            multiline
            rows={1}
            hasBackground={false}
            hasBorder={false}
            readOnly
            tabIndex={-1}
            aria-label="New property value"
          />
        </div>
        {menu}
      </>
    );
  }

  return (
    <>
      <div ref={rowRef} className="property-list__add-row">
        <Button
          variant="ghost"
          size="medium"
          leading={<AppIcon icon="plus" />}
          onClick={() => {
            suppressReturnFocusRef.current = false;
            setIsOpen(true);
          }}
        >
          Add a property
        </Button>
      </div>
      {menu}
    </>
  );
}
