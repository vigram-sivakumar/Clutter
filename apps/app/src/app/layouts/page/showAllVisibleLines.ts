import { readCustomProperties } from '@core/vault/ingest/frontmatter/customFrontmatter';
import { addVisibleProperty } from '@core/vault/ingest/frontmatter/propertyVisibility';

/**
 * Test fixture helper: `lines` plus a `properties.visible` list showing
 * every system Property and every custom property in `lines`. Nothing is
 * shown without one, so tests about a Property's behavior (not about
 * visibility) opt in with this.
 */
export function withAllVisible(lines: readonly string[] = []): string[] {
  const keys = [
    'tags',
    'aliases',
    'created',
    'modified',
    ...readCustomProperties(lines).map((property) => property.key),
  ];

  return keys.reduce<string[]>((current, key) => addVisibleProperty(current, key), [...lines]);
}
