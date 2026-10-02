import { PAGE_SYSTEM_PROPERTY_KEYS } from '@core/properties/systemProperties';
import { addVisibleProperty } from '@core/vault/ingest/frontmatter/propertyVisibility';

/**
 * Test fixture helper: `lines` plus a `properties.visible` list showing every
 * system Property. Custom properties need nothing — they are displayed
 * because their key exists — and no system property is listed without one,
 * so tests about a Property's behavior (not about visibility) opt in with
 * this.
 */
export function withAllVisible(lines: readonly string[] = []): string[] {
  return PAGE_SYSTEM_PROPERTY_KEYS.reduce<string[]>((current, key) => addVisibleProperty(current, key), [...lines]);
}
