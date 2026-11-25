/** The single candidate-selection pipeline. Policy supplies names, the caller supplies occupancy.
 * Keep synchronous Vault lookups and asynchronous filesystem lookups on the same ordered sequence.
 * A successful lookup is not a reservation: writers must still use exclusive/no-clobber operations.
 */
export type CollisionCandidate = (attempt: number) => string;

function* collisionCandidates(candidate: CollisionCandidate): Generator<string, never, unknown> {
  for (let attempt = 0; ; attempt += 1) yield candidate(attempt);
}

export function resolveAvailableName(candidate: CollisionCandidate, isTaken: (name: string) => boolean): string {
  for (const name of collisionCandidates(candidate)) {
    if (!isTaken(name)) return name;
  }
  throw new Error('Name candidate sequence exhausted');
}

export async function resolveAvailableNameAsync(candidate: CollisionCandidate, isTaken: (name: string) => Promise<boolean>): Promise<string> {
  for (const name of collisionCandidates(candidate)) {
    if (!(await isTaken(name))) return name;
  }
  throw new Error('Name candidate sequence exhausted');
}

export interface ResolveCollisionFreeNameOptions {
  readonly firstSuffix?: number;
}

/** Preserve the caller's numeric suffix convention; default starts at 2. */
export function resolveCollisionFreeName(
  baseName: string,
  isTaken: (candidateName: string) => boolean,
  options?: ResolveCollisionFreeNameOptions
): string {
  const firstSuffix = options?.firstSuffix ?? 2;
  return resolveAvailableName(
    (attempt) => attempt === 0 ? baseName : `${baseName} ${firstSuffix + attempt - 1}`,
    isTaken
  );
}
