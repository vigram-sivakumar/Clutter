import { useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { customPropertyTypeOptions } from '@components/property-list/propertyTypeRegistry';
import type { CustomPropertyType } from '@core/properties/Property.types';
import { AppIcon } from '@shared/icon';
import type { iconRegistry } from '@shared/icon/iconRegistry';

/** A system Property that exists but isn't shown on this page, as the menu lists it. */
export interface AddableSystemProperty {
  /** The system Property's canonical key — handed back to `onAddSystemProperty`. */
  id: string;
  label: string;
  icon: keyof typeof iconRegistry;
}

export interface PageHeaderAddPropertyMenuProps {
  /**
   * System Properties available to show again — computed by the host from
   * the system-property definitions (never listed here), minus those the
   * page already shows. Omitted or empty: the menu has no system section,
   * which is the case until a system Property can be hidden.
   */
  systemProperties?: readonly AddableSystemProperty[];
  /** Shows the chosen system Property — its own key, type, formatting and editability apply unchanged. */
  onAddSystemProperty?(id: string): void;
  /** Adds a new, unnamed custom Property of the chosen type; the user names it next. */
  onAddCustomProperty(type: CustomPropertyType): void;
}

/**
 * The page header's "Add properties" control: a `+` beside More actions
 * that opens a menu of what can be added — the system Properties not
 * currently shown, then every custom Property type. The custom types come
 * from the property type registry (customPropertyTypeOptions), so this
 * menu holds no list of its own.
 *
 * Choosing a custom type adds its row at once (unnamed, name field
 * focused) rather than asking anything else: the type is picked first,
 * then named. Focus must stay on that new name field, so the Overlay's
 * "return focus to the trigger on close" is suppressed for the closing
 * that follows a choice — the same escape hatch More actions'
 * Description item uses.
 */
export function PageHeaderAddPropertyMenu({
  systemProperties = [],
  onAddSystemProperty,
  onAddCustomProperty,
}: PageHeaderAddPropertyMenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const suppressReturnFocusRef = useRef(false);

  const hasSystemSection = systemProperties.length > 0 && Boolean(onAddSystemProperty);

  function choose(action: () => void) {
    // Set before closing — see the component's doc comment.
    suppressReturnFocusRef.current = true;
    setOpen(false);
    action();
  }

  return (
    <>
      <Button
        className="page-header-controls__menu"
        ref={anchorRef}
        variant="outline-fill"
        isIconOnly
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add properties"
        onClick={() => {
          suppressReturnFocusRef.current = false;
          setOpen((value) => !value);
        }}
      >
        <AppIcon icon="plus" />
      </Button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        side="bottom"
        alignment="start"
        suppressReturnFocusRef={suppressReturnFocusRef}
      >
        <Menu size="medium" aria-label="Add properties">
          {hasSystemSection && (
            <>
              <MenuGroupTitle>System</MenuGroupTitle>
              {systemProperties.map((property) => (
                <MenuItem
                  key={property.id}
                  leading={<AppIcon icon={property.icon} />}
                  onClick={(event) => {
                    event.stopPropagation();
                    choose(() => onAddSystemProperty?.(property.id));
                  }}
                >
                  {property.label}
                </MenuItem>
              ))}
              <MenuGroupTitle>Custom</MenuGroupTitle>
            </>
          )}
          {customPropertyTypeOptions().map((option) => (
            <MenuItem
              key={option.type}
              leading={<AppIcon icon={option.icon} />}
              onClick={(event) => {
                event.stopPropagation();
                choose(() => onAddCustomProperty(option.type));
              }}
            >
              {option.label}
            </MenuItem>
          ))}
        </Menu>
      </Overlay>
    </>
  );
}
