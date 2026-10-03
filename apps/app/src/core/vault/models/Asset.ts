import type { VaultResource } from './VaultResource';

/** Where an asset's bytes live: a file in the vault, or a URL Clutter never copies in. */
export type AssetSource = 'local' | 'remote';

/** What kind of thing the asset is — independent of its source and of how it is used. */
export type AssetKind = 'image' | 'pdf';

/**
 * How a page or folder uses an asset. A usage is never an asset type: a local
 * image is `source: local` whether it is embedded, a cover, or both.
 * `attachment` is part of the vocabulary, but nothing in Clutter attaches a
 * file today, so the catalog never produces it yet.
 */
export type AssetUsage = 'embed' | 'cover' | 'attachment';

/** One place an asset is used: the page or folder, and how. */
export interface AssetReference {
  readonly usage: AssetUsage;
  readonly referrer: { readonly kind: 'page' | 'folder'; readonly id: string };
}

interface AssetBase {
  /** Local: the resource's id. Remote: `remote:` + the URL — the canonical reference, so the same URL is one asset. */
  readonly id: string;
  readonly kind: AssetKind;
  readonly name: string;
  /** From the file extension (or the URL's path) where it can be told. */
  readonly mimeType?: string;
  /** Every use of this asset across the vault, deduplicated per referrer and usage. Empty for a local file nothing references. */
  readonly references: readonly AssetReference[];
}

/** An asset file in the vault (the `VaultResource` stays the source of truth for its path, metadata and lifecycle). */
export interface LocalAsset extends AssetBase {
  readonly source: 'local';
  readonly resource: VaultResource;
}

/** An asset referenced by URL — it exists in Clutter only because something uses it. */
export interface RemoteAsset extends AssetBase {
  readonly source: 'remote';
  readonly url: string;
}

export type Asset = LocalAsset | RemoteAsset;

export function isAssetUsedAs(asset: Asset, usage: AssetUsage): boolean {
  return asset.references.some((reference) => reference.usage === usage);
}
