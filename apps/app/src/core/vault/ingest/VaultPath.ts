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

  /**
   * A page's display name — its filename, minus a trailing `.md` — derived
   * from its path the same way everywhere it's needed: PageBuilder (initial
   * scan), PageOperations (a still-unpersisted draft's default title), and
   * Vault.updatePagePath (recomputed after a move or rename). One
   * implementation, not three (rule 4).
   */
  static pageName(path: string): string {
    const fileName = this.filename(path);
    return fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
  }

  /**
   * Whether a filesystem entry is hidden by name alone (dot-prefixed —
   * `.git`, `.obsidian`, `.clutter`, `notes/.archive.md`'s `.archive.md`,
   * etc.), independent of where it sits in the tree. The single rule
   * `VaultScanner` applies to exclude such entries from the workspace,
   * replacing what used to be `.clutter`-specific handling. Future home for
   * a user-facing "show hidden files" preference: that setting would gate
   * this check (`showHiddenFiles || !VaultPath.isHidden(name)`), not add a
   * second predicate elsewhere.
   */
  static isHidden(name: string): boolean {
    return name.startsWith('.');
  }
}
