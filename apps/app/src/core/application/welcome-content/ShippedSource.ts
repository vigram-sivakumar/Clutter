/**
 * ADR-067: the opaque inputs of `PageOperations.createFromSource` and `FolderOperations.createFromSource`.
 *
 * A shipped source is one file of Clutter's own bundled welcome content, to be written exactly as shipped. The
 * brand is a symbol that is not exported, so a source cannot be built by writing an object literal, and the minting
 * functions below are imported only by this folder (`welcomeContentContract.test.ts` enforces that). That keeps the
 * two facade methods from becoming a general-purpose verbatim-write API (ARCHITECTURE_RULES.md rule 1).
 */
declare const shippedSourceBrand: unique symbol;

interface ShippedSourceBase {
  readonly [shippedSourceBrand]: true;
  /** Absolute path the file is written to. */
  readonly path: string;
  /** The parent Vault folder's id, or `null` for the Space root. Never guessed: it comes from the result that created the parent. */
  readonly parentId: string | null;
  /** The exact bundled text, written unchanged. */
  readonly content: string;
}

/** A bundled note. `id` is the frontmatter `id` of `content`, which the Vault page keeps. */
export interface ShippedPageSource extends ShippedSourceBase {
  readonly kind: 'page';
  readonly id: string;
}

/**
 * A bundled folder's `.folder.md`. Only minted after the folder's directory was created *exclusively* by the caller
 * (`fileSystem.createDirectory(path, { exclusive: true })` succeeded), so the marker can only ever be written into a
 * directory this install created, never one that was already there.
 */
export interface ShippedFolderSource extends ShippedSourceBase {
  readonly kind: 'folder';
  readonly id: string;
}

export type CreateFromSourceOutcome =
  | { readonly status: 'created'; readonly id: string }
  | { readonly status: 'skipped'; readonly reason: CreateFromSourceSkipReason };

export type CreateFromSourceSkipReason = 'id-exists' | 'path-exists' | 'parent-unknown';

export function mintShippedPageSource(input: Omit<ShippedPageSource, typeof shippedSourceBrand | 'kind'>): ShippedPageSource {
  return { ...input, kind: 'page' } as ShippedPageSource;
}

export function mintShippedFolderSource(input: Omit<ShippedFolderSource, typeof shippedSourceBrand | 'kind'>): ShippedFolderSource {
  return { ...input, kind: 'folder' } as ShippedFolderSource;
}

/** The queue slot of a source's write. Never a page or folder id, so the Gate's existing-id check cannot match it. */
export function shippedSourceQueueKey(source: { readonly path: string }): string {
  return `shipped-source:${source.path}`;
}

/**
 * The Gate wrote the file and then the Vault refused to register it (`PersistenceResult` `abandoned`). For the Gate's
 * `create` and `create-folder` kinds that is the only way a result is `abandoned`, and it is always after the write
 * succeeded: the file is on disk, but the Vault does not hold it. A different cause from a write that failed, so it
 * has its own error, with the path, the kind and the Gate's own words kept.
 *
 * The usual cause is Sync registering the same path first (the OS watcher reported the new directory).
 */
export class WrittenButNotRegisteredError extends Error {
  readonly name = 'WrittenButNotRegisteredError';

  constructor(
    readonly path: string,
    readonly sourceKind: 'page' | 'folder',
    /** The Gate's own reason, unchanged. */
    readonly gateReason: string
  ) {
    super(`The ${sourceKind === 'page' ? 'note' : 'folder marker'} at ${path} was written, but the Vault did not accept it: ${gateReason}`);
  }
}
