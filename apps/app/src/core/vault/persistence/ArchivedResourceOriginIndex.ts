import type { ArchivedResourceOrigins } from '../models/archivedOrigin';

/**
 * The in-memory copy of `.clutter/resource-archive.json` that reference resolution reads: where each archived
 * asset came from, by its current path in `Archive/`. Resolution is synchronous and the file is not, so
 * `ResourceArchiveMetadataStore` hands this the whole record set after every read and every successful write.
 * It only answers; whether the file is really in the Archive is decided against the Vault at lookup time.
 */
export class ArchivedResourceOriginIndex implements ArchivedResourceOrigins {
  private origins = new Map<string, string>();

  replaceAll(entries: ReadonlyMap<string, { readonly originalPath: string }>): void {
    this.origins = new Map([...entries].map(([archivedPath, entry]) => [archivedPath, entry.originalPath]));
  }

  originalPathOf(archivedPath: string): string | undefined {
    return this.origins.get(archivedPath);
  }
}
