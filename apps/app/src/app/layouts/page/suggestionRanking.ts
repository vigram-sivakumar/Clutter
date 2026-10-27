import { foldString } from '@core/application/search/foldText';
import { BodyText, parseQuery, type MatchClass } from '@core/application/search/matchPage';
import { rankPages, type ScanCandidate } from '@core/application/search/rankPages';

/** One target an autocomplete could offer, with what a query is matched against. */
export interface RankEntry<T> {
  /** Unique among the entries. */
  readonly key: string;
  readonly suggestion: T;
  /** The text a query is matched against (a name, or a whole path for a location query). */
  readonly title: string;
  readonly aliases?: readonly string[];
  /** When the target was last edited (epoch ms, 0 when unknown): a small tie-breaker in the ranking. */
  readonly updatedMs: number;
}

export interface Ranked<T> {
  readonly suggestion: T;
  /** Where the query was found — absent for an entry kept without being ranked. */
  readonly matchedBy?: MatchClass;
}

/**
 * The one ordering every autocomplete uses for a typed query: the search overlay's own relevance ranking
 * (`parseQuery` + `rankPages`, ADR-061), over titles and aliases only — there is no body to look in — so results
 * are ordered by match quality, never by what kind of target they are. A short query ("UX") also searches
 * aliases, which the overlay would leave to titles: an alias is exactly what a short link query names.
 *
 * `keepUnranked`: an entry the caller already decided matches (by its own rules) but the ranking does not find is
 * listed after the ranked ones, in the order given, instead of being dropped.
 */
export function rankByMatchQuality<T>(
  rawQuery: string,
  entries: readonly RankEntry<T>[],
  keepUnranked = false
): Ranked<T>[] {
  const parsed = parseQuery(rawQuery);
  if (!parsed) {
    return keepUnranked ? entries.map(({ suggestion }) => ({ suggestion })) : [];
  }
  const query = { ...parsed, titleOnly: false };

  const byKey = new Map<string, T>();
  const candidates: ScanCandidate[] = entries.map((entry) => {
    const title = foldString(entry.title);
    byKey.set(entry.key, entry.suggestion);

    return {
      id: entry.key,
      meta: { title, aliases: (entry.aliases ?? []).map(foldString), headings: [], tags: [] },
      body: new BodyText(''),
      updatedMs: entry.updatedMs,
      sortTitle: title,
    };
  });

  const ranked: Ranked<T>[] = rankPages(query, candidates, Number.POSITIVE_INFINITY).map((hit) => ({
    suggestion: byKey.get(hit.id)!,
    matchedBy: hit.cls,
  }));

  if (!keepUnranked) {
    return ranked;
  }

  const rankedSuggestions = new Set(ranked.map(({ suggestion }) => suggestion));

  return [...ranked, ...entries.filter(({ suggestion }) => !rankedSuggestions.has(suggestion)).map(({ suggestion }) => ({ suggestion }))];
}

/**
 * The order of a bare trigger's list: last edited first. An entry with no usable time goes after every dated one,
 * alphabetically by `tiebreak` (natural order, case-insensitive), so the order is always the same.
 */
export function sortByLastEdited<T>(items: readonly T[], editedMs: (item: T) => number, tiebreak: (item: T) => string): T[] {
  return [...items].sort(
    (a, b) =>
      editedMs(b) - editedMs(a) ||
      tiebreak(a).localeCompare(tiebreak(b), undefined, { numeric: true, sensitivity: 'base' })
  );
}
