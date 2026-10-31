import type { Folder } from '@core/vault/models';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import { getPageDisplayLabel } from '@core/presentation/getPageDisplayLabel';
import { getFolderDisplayLabel } from '@core/presentation/getFolderDisplayLabel';
import type { PropertyId } from '@core/properties/collectionProperties';
import { sortEntries } from '@core/properties/collectionSort';
import { sidebarOrderId, type SidebarSort } from '@core/properties/sidebarSort';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { toFolderValues, toNoteValues } from '@features/collection/page/toCollectionPageModel';

/** One child of a level: notes and folders are ONE sibling sequence, whatever the sort. */
export type LevelEntry =
  | { readonly kind: 'folder'; readonly folder: Folder }
  | { readonly kind: 'page'; readonly entry: EffectivePage };

/** The id a level entry has in a manual order (`n:`/`f:` + its id). */
export function levelEntryOrderId(entry: LevelEntry): string {
  return entry.kind === 'folder' ? sidebarOrderId('folder', entry.folder.id) : sidebarOrderId('note', entry.entry.id);
}

const labelOf = (entry: LevelEntry): string =>
  entry.kind === 'folder' ? getFolderDisplayLabel(entry.folder).text : getPageDisplayLabel(entry.entry).text;

/** Equal (or both-missing) timestamps are ordered by name, A→Z, whichever the direction. */
const TIMESTAMP_TIE_BREAK: ReadonlySet<PropertyId> = new Set<PropertyId>(['created', 'updated']);

/**
 * Manual order (ADR-055): listed items in their stored positions, then everything not listed — new,
 * moved in, created outside the app — in the order given (by name). Ids in the list that match nothing are
 * ignored and a repeated id counts once (first position), so a stale or hand-edited list can never lose or
 * duplicate a row. An absent list leaves everything in the order given.
 */
function applyManualOrder<T>(items: readonly T[], idOf: (item: T) => string, order: readonly string[] | undefined): readonly T[] {
  const rank = new Map<string, number>();
  (order ?? []).forEach((id, index) => {
    if (!rank.has(id)) {
      rank.set(id, index);
    }
  });

  const listed = items.filter((item) => rank.has(idOf(item))).sort((a, b) => rank.get(idOf(a))! - rank.get(idOf(b))!);
  const unlisted = items.filter((item) => !rank.has(idOf(item)));

  return [...listed, ...unlisted];
}

/**
 * A level's folders and notes as ONE sequence, in the order the level's sort gives:
 *
 *  - `name`    — alphabetical (a stored `kind` sort, retired from the menu, reads as this)
 *  - `created` — by creation time, `down` newest first / `up` oldest first
 *  - `updated` — by last edit, `down` newest first / `up` oldest first
 *  - `manual`  — the user's saved order; anything not in it follows, by name
 *
 * Folders carry no created/edited date (`FolderMetadata` has none), so under those two sorts they count as
 * missing — which sorts last, in name order. Missing or invalid timestamps never reorder anything unstably:
 * ties and missing values fall back to name, then to id. No sort at all reads as `name`, A→Z.
 */
export function sortLevelEntries(
  folders: readonly Folder[],
  pages: readonly EffectivePage[],
  sort: SidebarSort | undefined,
  order: readonly string[] | undefined
): readonly LevelEntry[] {
  const entries: LevelEntry[] = [
    ...pages.map((entry): LevelEntry => ({ kind: 'page', entry })),
    ...folders.map((folder): LevelEntry => ({ kind: 'folder', folder })),
  ];
  const named = entries
    .map((entry) => ({ entry, name: labelOf(entry), id: levelEntryOrderId(entry) }))
    // The deterministic floor under every mode: by name, then by id (the engine's sorts are stable).
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (sort?.key === 'manual') {
    return applyManualOrder(
      named.map((item) => item.entry),
      levelEntryOrderId,
      order
    );
  }

  const property = sort?.key === 'created' || sort?.key === 'updated' ? sort.key : 'name';

  return sortEntries(
    named.map(({ entry, name }) => ({
      entry,
      values: entry.kind === 'folder' ? toFolderValues(name, entry.folder) : toNoteValues(name, entry.entry),
    })),
    { property, direction: sort?.direction ?? 'down' },
    { nameTieBreak: TIMESTAMP_TIE_BREAK }
  ).map((item) => item.entry);
}

/** A level's folders (the root's are the workspace's) and — nested only; the root draws its own — its notes. */
export function levelEntries(
  membershipSelector: MembershipSelector,
  parentId: string | null,
  sort: SidebarSort | undefined,
  order: readonly string[] | undefined
): readonly LevelEntry[] {
  return sortLevelEntries(
    parentId === null ? membershipSelector.getWorkspaceFolders() : membershipSelector.getVisibleChildFolders(parentId),
    parentId === null ? [] : membershipSelector.getNotesChildPages(parentId),
    sort,
    order
  );
}

/**
 * The ids of a level's reorderable children (folders and notes — files are not part of manual order) in
 * the order they are drawn right now. It is what a first manual reorder starts from, so nothing visibly
 * jumps. The root has folders only.
 */
export function displayedOrderIds(
  membershipSelector: MembershipSelector,
  parentId: string | null,
  sort: SidebarSort | undefined,
  order: readonly string[] | undefined
): string[] {
  return levelEntries(membershipSelector, parentId, sort, order).map(levelEntryOrderId);
}

/**
 * `order` with every one of `movedIds` taken out and put, TOGETHER, just before/after `anchorId` — the several-item
 * twin of `placeInOrder`. The moved items keep the relative order they have in `order` (not the order they were
 * named in), the anchor's position is found among what is LEFT once they are out (so the result is right whichever
 * side of the anchor they came from), and everything not moved keeps its relative order. Unchanged if the anchor
 * is missing or is itself one of the moved items. A moved id `order` does not hold (stale) follows the others.
 */
export function placeManyInOrder(
  order: readonly string[],
  movedIds: readonly string[],
  anchorId: string,
  edge: 'before' | 'after'
): string[] {
  const moved = new Set(movedIds);

  if (moved.has(anchorId) || !order.includes(anchorId)) {
    return [...order];
  }

  const together = [...order.filter((id) => moved.has(id)), ...movedIds.filter((id) => !order.includes(id))];
  const rest = order.filter((id) => !moved.has(id));
  const at = rest.indexOf(anchorId) + (edge === 'after' ? 1 : 0);

  return [...rest.slice(0, at), ...together, ...rest.slice(at)];
}

/** `order` with `movedId` taken out and put just before/after `anchorId`. Unchanged if the anchor is missing or is the item itself. */
export function placeInOrder(
  order: readonly string[],
  movedId: string,
  anchorId: string,
  edge: 'before' | 'after'
): string[] {
  if (movedId === anchorId || !order.includes(anchorId)) {
    return [...order];
  }

  const rest = order.filter((id) => id !== movedId);
  const at = rest.indexOf(anchorId) + (edge === 'after' ? 1 : 0);

  return [...rest.slice(0, at), movedId, ...rest.slice(at)];
}
