/**
 * IdentitySource indicates the origin of an identity.
 * - 'frontmatter' means the identity originated from a persisted identifier.
 * - 'derived' means the identity was temporarily inferred because no persisted identifier exists.
 * - Derived identities are transitional and should not be treated as permanently stable.
 */
export type IdentitySource = 'frontmatter' | 'derived';

export interface ResolvedIdentity {
  readonly id: string;
  readonly source: IdentitySource;
}

/**
 * The IdentityResolver establishes the identity used while building the immutable Vault snapshot.
 * Persisted frontmatter IDs are authoritative.
 * Path-derived identities exist only to support Markdown that has not yet adopted persistent IDs.
 * Long-term architectural goal: every page and folder should eventually have a persisted ID.
 */
export class IdentityResolver {
  resolvePage(
    frontmatterId: string | undefined,
    path: string
  ): ResolvedIdentity {
    return this.resolve(frontmatterId, path);
  }

  resolveFolder(
    frontmatterId: string | undefined,
    path: string
  ): ResolvedIdentity {
    return this.resolve(frontmatterId, path);
  }

  /**
   * A non-Markdown vault resource (PDF/image) has no frontmatter to carry a
   * persisted id — its identity is always path-derived, never 'frontmatter'
   * sourced, until a future ID mechanism for binary files exists.
   */
  resolveResource(path: string): ResolvedIdentity {
    return this.resolve(undefined, path);
  }

  /**
   * Resolution prefers persisted IDs.
   * Falling back to the path is a compatibility mechanism, not the preferred identity strategy.
   * Future CRUD operations should migrate path-derived identities to persisted IDs before operations such as rename or move rely on identity stability.
   */
  private resolve(
    frontmatterId: string | undefined,
    path: string
  ): ResolvedIdentity {
    if (frontmatterId) {
      return {
        id: frontmatterId,
        source: 'frontmatter',
      };
    }
    // TODO: Path-derived identities are a temporary compatibility mechanism.
    // Future save/import workflows should persist stable IDs into frontmatter so
    // identity no longer depends on mutable filesystem paths.
    return {
      id: path,
      source: 'derived',
    };
  }
}
