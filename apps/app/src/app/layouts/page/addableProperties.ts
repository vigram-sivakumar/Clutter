import { propertyTypeRegistry } from '@components/property-list/propertyTypeRegistry';
import type { CustomPropertyType } from '@core/properties/Property.types';
import {
  PAGE_SYSTEM_PROPERTY_KEYS,
  systemPropertyDefinitions,
} from '@core/properties/systemProperties';
import { readCustomProperties } from '@core/vault/ingest/frontmatter/customFrontmatter';
import { readVisibleProperties } from '@core/vault/ingest/frontmatter/propertyVisibility';
import type { Page } from '@core/vault/models/Page';

import type {
  AddableSystemProperty,
  HiddenPropertyOption,
} from './header/AddPropertyMenu';

/** What the Add properties menu can show for a page, besides new custom types. */
export interface AddableProperties {
  /** System Properties the page doesn't show yet, in their usual order. */
  systemProperties: AddableSystemProperty[];
  /** Custom properties that are in the frontmatter but not shown. */
  hiddenProperties: HiddenPropertyOption[];
}

/**
 * The existing properties Add properties can show on `page`: the system
 * Properties and custom properties whose canonical key is not in
 * `properties.visible`. A shown property is never offered again.
 *
 * System labels and icons come from the system property definitions and
 * the property type registry — the same sources the Properties list uses —
 * and a custom property is identified by its actual frontmatter key.
 */
export function getAddableProperties(page: Page): AddableProperties {
  const lines = page.metadata.unownedFrontmatter ?? [];
  const visible = new Set(readVisibleProperties(lines));

  return {
    systemProperties: PAGE_SYSTEM_PROPERTY_KEYS.filter((key) => !visible.has(key)).map((key) => ({
      id: key,
      label: systemPropertyDefinitions[key].label,
      icon: propertyTypeRegistry[systemPropertyDefinitions[key].type].icon,
    })),
    hiddenProperties: readCustomProperties(lines)
      .filter((property) => !visible.has(property.key))
      .map((property) => ({
        key: property.key,
        type: (property.type === 'list' ? 'multi-select' : property.type) satisfies CustomPropertyType,
      })),
  };
}
