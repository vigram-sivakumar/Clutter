/**
 * The one place path-string semantics live outside `platform/` — per
 * ARCHITECTURE_RULES.md rule 10. A pure value object: it knows only how to
 * interpret a path string, nothing about the filesystem, `Vault`, ids,
 * `Page`/`Folder`, metadata, persistence, or any other business rule. Every
 * method takes plain strings and returns plain strings/booleans.
 *
 * Future extension point: a `.folder.md` sibling-metadata-file path (e.g.
 * for a folder's own metadata file, or an eventual vault-root metadata
 * file) is pure path composition and belongs here when that work is
 * scheduled — not as an ad hoc string concatenation at whichever call site
 * needs it first.
 */
export class VaultPath {
  static filename(path: string): string {
    const lastSlashIndex = path.lastIndexOf('/');
    return lastSlashIndex >= 0 ? path.slice(lastSlashIndex + 1) : path;
  }

  static parentDirectory(path: string): string {
    const lastSlashIndex = path.lastIndexOf('/');
    return lastSlashIndex >= 0 ? path.slice(0, lastSlashIndex) : '';
  }

  static isDescendantOf(path: string, ancestorPath: string): boolean {
    return path.startsWith(`${ancestorPath}/`);
  }
}
