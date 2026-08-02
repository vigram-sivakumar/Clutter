/**
 * Appends a numeric suffix (" 2", " 3", ...) to baseName until isTaken
 * returns false. Shared by PagePathResolver and FolderPathResolver — the
 * same collision-avoidance rule, applied to two different path shapes (a
 * note's ".md" file vs a folder's bare directory name), previously
 * duplicated identically in both.
 */
export function resolveCollisionFreeName(
  baseName: string,
  isTaken: (candidateName: string) => boolean
): string {
  let candidateName = baseName;
  let suffix = 1;

  while (isTaken(candidateName)) {
    suffix += 1;
    candidateName = `${baseName} ${suffix}`;
  }

  return candidateName;
}
