export type VaultResourceKind = 'pdf' | 'image';

/**
 * Facts about the resource's file, read once by Ingest/Sync (ADR-038) — not
 * Page Properties. Timestamps are ISO-8601 (like Pages'); `null` when the
 * platform cannot report one (not every filesystem records a creation time).
 */
export interface VaultResourceMetadata {
  /** File size in bytes. */
  readonly size: number;
  readonly createdAt: string | null;
  readonly modifiedAt: string | null;
}

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
  /** Absent when the file system could not be stat'd (no `stat` primitive, or the call failed). */
  readonly metadata?: VaultResourceMetadata;
}
