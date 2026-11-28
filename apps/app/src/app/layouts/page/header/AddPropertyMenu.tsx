import { Menu } from '@components/menu/Menu';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { MenuItem } from '@components/menu/MenuItem';
import { customPropertyTypeOptions } from '@components/property-list/propertyTypeRegistry';
import type { CustomPropertyType } from '@core/properties/Property.types';
import type { PageSystemPropertyKey } from '@core/properties/systemProperties';
import { AppIcon } from '@shared/icon';
import type { iconRegistry } from '@shared/icon/iconRegistry';
import './AddPropertyMenu.css';

/** A system Property that exists but isn't shown on this page, as the menu lists it. */
export interface AddableSystemProperty {
  /** The system Property's canonical key — handed back to `onAddSystemProperty`. */
  id: PageSystemPropertyKey;
  label: string;
  icon: keyof typeof iconRegistry;
}

export interface AddPropertyMenuProps {
  /**
   * System Properties not currently listed — computed by the host from the
   * system property definitions (never listed here), minus those the page
   * lists. Omitted or empty: none offered.
   */
  systemProperties?: readonly AddableSystemProperty[];
  /** Lists a system property by its canonical key (its value is untouched). Omitted: system properties aren't offered. */
  onAddSystemProperty?(key: PageSystemPropertyKey): void;
  /** Adds a new, unnamed custom Property of the chosen type; the user names it next. */
  onAddCustomProperty(type: CustomPropertyType): void;
}

/**
 * Creation only: unlisted system properties in their own group, then every
 * custom type from the property type registry. AddPropertyRow owns the
 * separate management menu and closes this picker after a choice.
 *
 * Choosing a system property just declares it (its key joins the note's
 * frontmatter; an existing value is untouched). Choosing a custom type adds
 * its row at once (unnamed, name field focused) rather than asking anything
 * else: the type is picked first, then named.
 */
export function AddPropertyMenu({
  systemProperties = [],
  onAddSystemProperty,
  onAddCustomProperty,
}: AddPropertyMenuProps) {
  const showSystem =
    Boolean(onAddSystemProperty) && systemProperties.length > 0;

  return (
    <Menu
      size="medium"
      aria-label="Add properties"
      className="add-property-menu"
    >
      {showSystem && (
        <>
          <MenuGroupTitle>System properties</MenuGroupTitle>
          {systemProperties.map((property) => (
            <MenuItem
              key={property.id}
              leading={<AppIcon icon={property.icon} />}
              onClick={(event) => {
                event.stopPropagation();
                onAddSystemProperty?.(property.id);
              }}
            >
              {property.label}
            </MenuItem>
          ))}
          <div className="menu__divider" role="separator" />
        </>
      )}
      <MenuGroupTitle>Custom properties</MenuGroupTitle>
      {customPropertyTypeOptions().map((option) => (
        <MenuItem
          key={option.type}
          leading={<AppIcon icon={option.icon} />}
          onClick={(event) => {
            event.stopPropagation();
            onAddCustomProperty(option.type);
          }}
        >
          {option.label}
        </MenuItem>
      ))}
    </Menu>
  );
}
