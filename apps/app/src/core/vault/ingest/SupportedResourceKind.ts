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
