import type { VaultResource } from '../models';
import type { ScannedResourceFile } from './VaultScanResult';
import { IdentityResolver } from './identity/IdentityResolver';
import { VaultPath } from './VaultPath';

export interface BuildResourceInput {
  readonly parentId: string | null;
  readonly file: ScannedResourceFile;
}

/**
 * Pure transformation: a scanned resource file (plus its already-resolved
 * parentId) -> a domain VaultResource. Mirrors FolderBuilder's shape.
 * Never routed through DocumentLoader — a PDF/image has no frontmatter or
 * Markdown body to parse.
 */
export class ResourceBuilder {
  private readonly identityResolver = new IdentityResolver();

  build(input: BuildResourceInput): VaultResource {
    const { file, parentId } = input;
    const identity = this.identityResolver.resolveResource(file.path);

    return {
      id: identity.id,
      kind: file.kind,
      name: VaultPath.filename(file.path),
      path: file.path,
      parentId,
    };
  }
}
