import { Menu } from '@components/menu/Menu';
import { MenuGroupTitle } from '@components/menu/MenuGroupTitle';
import { MenuItem } from '@components/menu/MenuItem';
import {
  customPropertyTypeOptions,
  propertyTypeRegistry,
} from '@components/property-list/propertyTypeRegistry';
import type { CustomPropertyType } from '@core/properties/Property.types';
import { AppIcon } from '@shared/icon';
import type { iconRegistry } from '@shared/icon/iconRegistry';

/** A system Property that exists but isn't shown on this page, as the menu lists it. */
export interface AddableSystemProperty {
  /** The system Property's canonical key — handed back to `onShowProperty`. */
  id: string;
  label: string;
  icon: keyof typeof iconRegistry;
}

/** A custom property that exists in the frontmatter but isn't shown, as the menu lists it. */
export interface HiddenPropertyOption {
  /** Its actual frontmatter key — shown as its name, and handed back to `onShowProperty`. */
  key: string;
  /** The type its value is read as, for its icon. */
  type: CustomPropertyType;
}

export interface AddPropertyMenuProps {
  /**
   * System Properties not currently shown — computed by the host from the
   * system property definitions (never listed here), minus those the page
   * shows. Omitted or empty: none listed.
   */
  systemProperties?: readonly AddableSystemProperty[];
  /** Custom properties in the frontmatter that aren't shown. Omitted or empty: none listed. */
  hiddenProperties?: readonly HiddenPropertyOption[];
  /** Shows an existing property: a system Property's canonical key, or a custom property's actual key. */
  onShowProperty?(key: string): void;
  /** Adds a new, unnamed custom Property of the chosen type; the user names it next. */
  onAddCustomProperty(type: CustomPropertyType): void;
  /** Hides the whole Properties section (its properties are kept). Omitted: no "Hide Properties" action. */
  onHideProperties?(): void;
  /** Starts removing every property from the note (the host confirms first). Omitted: no "Delete all" action. */
  onRemoveAll?(): void;
}

/**
 * What can be added to the page's Properties: the properties that exist but
 * aren't shown, under a "Hidden" title, then every custom type under a "Type"
 * title, then a divider and the optional actions (Hide Properties, Delete all).
 * Under "Hidden": the system Properties not currently shown, then the custom
 * properties that exist but aren't shown. The custom types come from the
 * property type registry (customPropertyTypeOptions), so this
 * menu holds no list of its own. Hosted by the Properties section's
 * "+ Add a property" row (AddPropertyRow), which closes it after a choice.
 *
 * Choosing an existing property just shows it (its key joins the note's
 * `properties.visible`). Choosing a custom type adds its row at once (unnamed, name field
 * focused) rather than asking anything else: the type is picked first,
 * then named.
 */
export function AddPropertyMenu({
  systemProperties = [],
  hiddenProperties = [],
  onShowProperty,
  onAddCustomProperty,
  onHideProperties,
  onRemoveAll,
}: AddPropertyMenuProps) {
  const canShow = Boolean(onShowProperty);
  const showSystem = canShow && systemProperties.length > 0;
  const showHidden = canShow && hiddenProperties.length > 0;
  const hasActions = Boolean(onHideProperties || onRemoveAll);

  return (
    <Menu size="medium" aria-label="Add properties">
      {(showSystem || showHidden) && <MenuGroupTitle>Hidden</MenuGroupTitle>}
      {showSystem && (
        <>
          {systemProperties.map((property) => (
            <MenuItem
              key={property.id}
              leading={<AppIcon icon={property.icon} />}
              onClick={(event) => {
                event.stopPropagation();
                onShowProperty?.(property.id);
              }}
            >
              {property.label}
            </MenuItem>
          ))}
        </>
      )}
      {showHidden && (
        <>
          {hiddenProperties.map((property) => (
            <MenuItem
              key={property.key}
              leading={<AppIcon icon={propertyTypeRegistry[property.type].icon} />}
              onClick={(event) => {
                event.stopPropagation();
                onShowProperty?.(property.key);
              }}
            >
              {property.key}
            </MenuItem>
          ))}
        </>
      )}
      <MenuGroupTitle>Type</MenuGroupTitle>
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
      {onRemoveAll && (
        <MenuItem
          leading={<AppIcon icon="trash" />}
          onClick={(event) => {
            event.stopPropagation();
            onRemoveAll();
          }}
        >
          Delete all
        </MenuItem>
      )}
    </Menu>
  );
}
