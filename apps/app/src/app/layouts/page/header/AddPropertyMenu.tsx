import { Menu } from '@components/menu/Menu';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { MenuItem } from '@components/menu/MenuItem';
import { customPropertyTypeOptions } from '@components/property-list/propertyTypeRegistry';
import type { CustomPropertyType } from '@core/properties/Property.types';
import type { PageSystemPropertyKey } from '@core/properties/systemProperties';
import { AppIcon } from '@shared/icon';
import type { iconRegistry } from '@shared/icon/iconRegistry';

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
  /** Hides the whole Properties section (its properties are kept). Omitted: no "Hide Properties" action. */
  onHideProperties?(): void;
  /** Starts removing every property from the note (the host confirms first). Omitted: no "Delete all" action. */
  onDeleteAll?(): void;
}

/**
 * What can be added to the page's Properties, as one list under a single
 * "Type" title: the system properties not currently listed (in the canonical
 * system order), then every custom type — then a divider and the optional
 * actions (Hide Properties, Delete all). The custom types come from the
 * property type registry (customPropertyTypeOptions), so this menu holds no
 * list of its own. Hosted by the Properties section's "+ Add a property"
 * button (AddPropertyRow), which closes it after a choice.
 *
 * Choosing a system property just lists it (its key joins the note's
 * `properties.visible`; its value is untouched). Choosing a custom type adds
 * its row at once (unnamed, name field focused) rather than asking anything
 * else: the type is picked first, then named.
 */
export function AddPropertyMenu({
  systemProperties = [],
  onAddSystemProperty,
  onAddCustomProperty,
  onHideProperties,
  onDeleteAll,
}: AddPropertyMenuProps) {
  const showSystem = Boolean(onAddSystemProperty) && systemProperties.length > 0;
  const hasActions = Boolean(onHideProperties || onDeleteAll);

  return (
    <Menu size="medium" aria-label="Add properties">
      <MenuGroupTitle>Type</MenuGroupTitle>
      {showSystem &&
        systemProperties.map((property) => (
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
      {hasActions && <div className="menu__divider" role="separator" />}
      {onHideProperties && (
        <MenuItem
          leading={<AppIcon icon="hide" />}
          onClick={(event) => {
            event.stopPropagation();
            onHideProperties();
          }}
        >
          Hide Properties
        </MenuItem>
      )}
      {onDeleteAll && (
        <MenuItem
          leading={<AppIcon icon="trash" />}
          onClick={(event) => {
            event.stopPropagation();
            onDeleteAll();
          }}
        >
          Delete all
        </MenuItem>
      )}
    </Menu>
  );
}
