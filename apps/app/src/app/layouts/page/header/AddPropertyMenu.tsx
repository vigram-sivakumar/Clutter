import { Menu } from '@components/menu/Menu';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { MenuItem } from '@components/menu/MenuItem';
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

export interface AddPropertyMenuProps {
  /**
   * System Properties available to show again — computed by the host from
   * the system-property definitions (never listed here), minus those the
   * page already shows. Omitted or empty: no system section, which is the
   * case until a system Property can be hidden.
   */
  systemProperties?: readonly AddableSystemProperty[];
  /** Shows the chosen system Property — its own key, type, formatting and editability apply unchanged. */
  onAddSystemProperty?(id: string): void;
  /** Adds a new, unnamed custom Property of the chosen type; the user names it next. */
  onAddCustomProperty(type: CustomPropertyType): void;
}

/**
 * What can be added to the page's Properties: the system Properties not
 * currently shown, then every custom Property type. The custom types come
 * from the property type registry (customPropertyTypeOptions), so this
 * menu holds no list of its own. Hosted as the "Add properties" view of
 * the page header's More actions menu (PageHeaderMoreActionsMenu), which
 * closes itself after a choice.
 *
 * Choosing a custom type adds its row at once (unnamed, name field
 * focused) rather than asking anything else: the type is picked first,
 * then named.
 */
export function AddPropertyMenu({
  systemProperties = [],
  onAddSystemProperty,
  onAddCustomProperty,
}: AddPropertyMenuProps) {
  const hasSystemSection = systemProperties.length > 0 && Boolean(onAddSystemProperty);

  return (
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
                onAddSystemProperty?.(property.id);
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
            onAddCustomProperty(option.type);
          }}
        >
          {option.label}
        </MenuItem>
      ))}
    </Menu>
  );
}
