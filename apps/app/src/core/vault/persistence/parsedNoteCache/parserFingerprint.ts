/**
 * Identifies what the parser and analysis would produce, so a cache written by
 * different parsing logic is never trusted (ADR-053). A matching content hash
 * alone is not enough.
 *
 * Bump `PARSER_VERSION` whenever a change in this repository can alter what
 * `FrontmatterParser.parse` returns for some text. History: 1 = initial cache;
 * 2 = `coverCredit` (ADR-054) became an owned frontmatter key, so a note with
 * that line now parses to `frontmatter.coverCredit` instead of an unowned line. The golden-corpus test
 * (`parserGolden.test.ts`) fails if the output changes without a bump.
 *
 * The dependency versions — the resolved versions of the packages the
 * analyzer's grammar depends on, injected at build time (see vite.config.ts) —
 * detect *version* changes. They do not detect a modified package whose
 * version number did not change; that is managed by lockfile-controlled
 * installs, the golden-corpus test and `PARSER_VERSION`.
 */
export const PARSER_VERSION = 2;

declare const __PARSE_DEPENDENCY_VERSIONS__: Record<string, string> | undefined;

export function buildParserFingerprint(
  dependencyVersions: Record<
    string,
    string
  > = typeof __PARSE_DEPENDENCY_VERSIONS__ === 'undefined'
    ? {}
    : __PARSE_DEPENDENCY_VERSIONS__,
  version: number = PARSER_VERSION
): string {
  const dependencies = Object.keys(dependencyVersions)
    .sort()
    .map((name) => `${name}@${dependencyVersions[name]}`)
    .join(',');
  return `parser-${version}|${dependencies}`;
}

export const PARSER_FINGERPRINT = buildParserFingerprint();
