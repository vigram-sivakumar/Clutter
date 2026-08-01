export interface ScannedAlias {
  readonly value: string;
}

export class AliasExtractor {
  extract(frontmatter: Record<string, unknown>): readonly ScannedAlias[] {
    const aliases = frontmatter.aliases;

    if (typeof aliases === 'string') {
      return [{ value: aliases.trim() }];
    }

    if (Array.isArray(aliases)) {
      return aliases
        .filter((alias): alias is string => typeof alias === 'string')
        .map((alias) => ({ value: alias.trim() }))
        .filter((alias) => alias.value.length > 0);
    }

    return [];
  }
}
