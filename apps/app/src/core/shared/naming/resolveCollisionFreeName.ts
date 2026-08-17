export interface ResolveCollisionFreeNameOptions {
  readonly firstSuffix?: number;
}

/**
 * Appends a numeric suffix (" 2", " 3", ...) to baseName until isTaken
 * returns false. Shared by PagePathResolver and FolderPathResolver — the
 * same collision-avoidance rule, applied to two different path shapes (a
 * note's ".md" file vs a folder's bare directory name), previously
 * duplicated identically in both.
 *
 * By default the first suffix tried when baseName is taken is 2 ("Note 2").
 * Pass `{ firstSuffix: 1 }` for Finder-style numbering ("Note 1") — used
 * by page move destination resolution only.
 */
export function resolveCollisionFreeName(
  baseName: string,
  isTaken: (candidateName: string) => boolean,
  options?: ResolveCollisionFreeNameOptions
): string {
  const firstSuffix = options?.firstSuffix ?? 2;

  if (!isTaken(baseName)) {
    return baseName;
  }

  let suffix = firstSuffix;

  while (isTaken(`${baseName} ${suffix}`)) {
    suffix += 1;
  }

  return `${baseName} ${suffix}`;
}
