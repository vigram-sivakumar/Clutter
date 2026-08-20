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
   * Whether two paths refer to the same filesystem entry on a
   * case-insensitive (but case-preserving) filesystem — the default for
   * both macOS (APFS) and Windows (NTFS), which LocalVaultProvider writes
   * to. `mkdir`/`writeFile` for a path differing from an existing one only
   * in case silently resolves to the *same* directory/file on disk rather
   * than erroring or creating a second entry — every place Vault decides
   * whether a candidate path collides with an existing one must ask this
   * question, not raw `===`, or a case-variant "new" folder/page silently
   * reuses (and can corrupt) an existing one's on-disk content while the
   * in-memory Vault projection ends up with two separate records for what
   * is physically one entry. `toLowerCase()` mirrors the ASCII-only
   * identity fold `normalizeTagName()` already uses for the same class of
   * problem (Tag.ts) — this codebase's existing precedent for "the domain
   * treats X as case-insensitive," not a new convention.
   */
  static equalsCaseInsensitive(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
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
}
