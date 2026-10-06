import { propertyTypeRegistry } from '@components/property-list/propertyTypeRegistry';
import {
  PAGE_SYSTEM_PROPERTY_KEYS,
  systemPropertyDefinitions,
} from '@core/properties/systemProperties';
import { readListedSystemProperties } from '@core/vault/ingest/frontmatter/propertyVisibility';
import type { Page } from '@core/vault/models/Page';

import type { AddableSystemProperty } from './header/AddPropertyMenu';

/**
 * The system properties the property picker can add to `page`: the page
 * system keys not in `properties.visible`, in the canonical system order. A
 * listed one is never offered again, and a removed one is offered again. (A
 * custom property is displayed because its key exists, so there is nothing
 * custom to add here besides a new type.)
 *
 * System labels and icons come from the system property definitions and the
 * property type registry — the same sources the Properties list uses.
 */
export function getAddableSystemProperties(page: Pick<Page, 'metadata'>): AddableSystemProperty[] {
  const listed = new Set(readListedSystemProperties(page.metadata.unownedFrontmatter ?? []));

  return PAGE_SYSTEM_PROPERTY_KEYS.filter((key) => !listed.has(key)).map((key) => ({
    id: key,
    label: systemPropertyDefinitions[key].label,
    icon: propertyTypeRegistry[systemPropertyDefinitions[key].type].icon,
  }));
}
