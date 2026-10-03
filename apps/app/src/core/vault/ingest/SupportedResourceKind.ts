import { VaultPath } from './VaultPath';

/**
 * Non-Markdown file kinds the vault currently recognizes as supported
 * resources (discoverable, but not Pages). Markdown continues to be
 * classified separately by VaultScanner's existing `.md` handling — this
 * type deliberately excludes it so the two pipelines (Page vs. resource
 * file) stay distinct at the type level.
 *
 * The image extension list is a starting set, not a final product
 * decision — extend IMAGE_EXTENSIONS here, and nowhere else, as more
 * formats are supported.
 */
export type SupportedResourceKind = 'pdf' | 'image';

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
]);

export function classifySupportedResourceFile(filename: string): SupportedResourceKind | null {
  const extension = VaultPath.extension(filename);

  if (extension === '.pdf') {
    return 'pdf';
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  return null;
}

/**
 * Every file extension (no leading dot) the vault ingests as a resource —
 * exactly the set `classifySupportedResourceFile` accepts, derived from it so a
 * file picker's filter (the Assets collection's Add action) can never drift from
 * what ingest will actually pick up.
 */
export function supportedResourceFileExtensions(): string[] {
  return [...IMAGE_EXTENSIONS, '.pdf'].map((extension) => extension.slice(1));
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

/**
 * The MIME type implied by a file name or URL path's extension, or undefined
 * when it can't be told (an extensionless URL). Derived, never stored. A
 * `?query` / `#fragment` is ignored, so a URL works as well as a path.
 */
export function mimeTypeForPath(pathOrUrl: string): string | undefined {
  const withoutSuffix = pathOrUrl.split(/[?#]/)[0] ?? '';

  return MIME_TYPES[VaultPath.extension(withoutSuffix)];
}
