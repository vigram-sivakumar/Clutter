export type VaultResourceKind = 'pdf' | 'image';

/**
 * A supported non-Markdown file discovered in the vault. Sibling to Page,
 * deliberately not a Page: it has no frontmatter, no Markdown source, and
 * no analysis — it exists only to be discoverable and located (identity,
 * name, path, parent folder). What to do when one is opened (viewer vs.
 * editor) is a concern for a later step, not this type.
 */
export interface VaultResource {
  readonly id: string;
  readonly kind: VaultResourceKind;

  readonly name: string;
  readonly path: string;
  readonly parentId: string | null;
}
