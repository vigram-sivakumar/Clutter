/**
 * The system Properties — the ones Clutter itself maintains for every
 * note — and the one place their user-facing names are defined.
 *
 * Each is identified by its canonical internal key: the frontmatter key
 * (`created`, `modified`, `tags`, `aliases`), or `lastOpened`, which the
 * collection views already persist under that name. The key is the
 * identity — what is stored, matched and (once per-note show/hide exists)
 * persisted — and never changes with the wording; the label is display
 * copy only, so renaming it can never break stored data. Every place that
 * shows one of these to the user (the Properties list, the Add properties
 * menu, the collection columns, sort and property menus) reads its label
 * from here rather than writing its own.
 *
 * `type` is the Property type each is shown as (its icon and value
 * component come from the property type registry).
 *
 * User-facing terminology: Created / Last edited / Last opened. The
 * internal names stay as they are (`modified` in frontmatter, `updatedAt`
 * on PageMetadata).
 */
import type { PropertyType } from './Property.types';

export type SystemPropertyKey = 'tags' | 'aliases' | 'created' | 'modified' | 'lastOpened';

export interface SystemPropertyDefinition {
  /** What the Property is called wherever it is shown. */
  readonly label: string;
  /** The Property type it is shown as. */
  readonly type: PropertyType;
}

export const systemPropertyDefinitions: Readonly<Record<SystemPropertyKey, SystemPropertyDefinition>> = {
  tags: { label: 'Tags', type: 'tag' },
  aliases: { label: 'Aliases', type: 'multi-select' },
  created: { label: 'Created', type: 'date' },
  modified: { label: 'Last edited', type: 'date' },
  lastOpened: { label: 'Last opened', type: 'date' },
};

/**
 * The system Properties a note's Properties list can show, in the order
 * it lists them. `lastOpened` is not one: it is a collection-view field,
 * not note metadata.
 */
export const PAGE_SYSTEM_PROPERTY_KEYS: readonly SystemPropertyKey[] = [
  'tags',
  'aliases',
  'created',
  'modified',
];

/** Whether `key` is a system Property a note can show (by its canonical key). */
export function isPageSystemPropertyKey(key: string): key is SystemPropertyKey {
  return (PAGE_SYSTEM_PROPERTY_KEYS as readonly string[]).includes(key);
}

/** The display label of a system Property. */
export function systemPropertyLabel(key: SystemPropertyKey): string {
  return systemPropertyDefinitions[key].label;
}
