/**
 * Archive-destination collision resolution (ADR-026 follow-up): the single
 * shared rule both MoveService.resolveArchiveDestination (pages) and
 * FolderPathResolver.resolveArchiveDestination (folders) call, mirroring how
 * they already share resolveEntityName/resolveCollisionFreeName for
 * create/rename. Deliberately a different shape than that rename-time rule
 * (" 2", " 3", ...): archiving is not a rename the user asked for, so the
 * common case must leave the name completely untouched, and the fallback
 * must read as "this collided at this moment," not as a sibling-ordinal —
 * a local-time, second-precision timestamp already carries that meaning
 * without inventing an id or any new persisted field.
 */

/**
 * `YYYY-MM-DD HH.mm.ss` in local time, 24-hour clock. Filesystem-safe (no
 * `:`), fixed-width, and — unlike Intl.DateTimeFormat — exactly this shape
 * on every platform/locale, which the collision fallback below depends on
 * for its own uniqueness.
 */
export function formatArchiveTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hours}.${minutes}.${seconds}`;
}

/**
 * `baseName` unchanged when free. On collision, `baseName` plus a local-time
 * timestamp (still the same logical name — the timestamp is a
 * filesystem-collision-resolution suffix, never a new identity). On the
 * (vanishingly rare) further collision — e.g. two archives of same-named
 * items within the same second — a deterministic ".01", ".02", ... suffix,
 * per the agreed design: no ids, no random strings, no new metadata.
 * `isTaken` is the caller's own occupancy predicate, already scoped to the
 * Archive/ destination and already excluding the item's own current
 * occupant of that path (mirrors resolveEntityName's contract exactly).
 */
export function resolveArchiveCollisionFreeName(
  baseName: string,
  isTaken: (candidateName: string) => boolean,
  now: Date
): string {
  if (!isTaken(baseName)) {
    return baseName;
  }

  const timestamped = `${baseName} ${formatArchiveTimestamp(now)}`;

  if (!isTaken(timestamped)) {
    return timestamped;
  }

  let suffix = 1;
  let candidate = `${timestamped}.${String(suffix).padStart(2, '0')}`;

  while (isTaken(candidate)) {
    suffix += 1;
    candidate = `${timestamped}.${String(suffix).padStart(2, '0')}`;
  }

  return candidate;
}
