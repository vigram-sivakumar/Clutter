export type IdentitySource = 'frontmatter' | 'derived';

export interface ResolvedIdentity {
  readonly id: string;
  readonly source: IdentitySource;
}

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
    return {
      id: path,
      source: 'derived',
    };
  }
}
