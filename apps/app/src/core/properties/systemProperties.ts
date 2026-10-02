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
 * User-facing terminology: Created / Last edited / Last opened. The
 * internal names stay as they are (`modified` in frontmatter, `updatedAt`
 * on PageMetadata).
 */
export type SystemPropertyKey = 'tags' | 'aliases' | 'created' | 'modified' | 'lastOpened';

export interface SystemPropertyDefinition {
  /** What the Property is called wherever it is shown. */
  readonly label: string;
}

export const systemPropertyDefinitions: Readonly<Record<SystemPropertyKey, SystemPropertyDefinition>> = {
  tags: { label: 'Tags' },
  aliases: { label: 'Aliases' },
  created: { label: 'Created' },
  modified: { label: 'Last edited' },
  lastOpened: { label: 'Last opened' },
};

/** The display label of a system Property. */
export function systemPropertyLabel(key: SystemPropertyKey): string {
  return systemPropertyDefinitions[key].label;
}
