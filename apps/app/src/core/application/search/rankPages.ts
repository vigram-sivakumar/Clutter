import {
  classify,
  confirmBody,
  metaIncludes,
  recencyPoints,
  type BodyText,
  type Classification,
  type FoldedMeta,
  type MatchClass,
  type ParsedQuery,
  type Snippet,
} from './matchPage';

/** What the scan needs to know about one page — already folded, so a query costs no per-page folding. */
export interface ScanCandidate {
  readonly id: string;
  readonly meta: FoldedMeta;
  readonly body: BodyText;
  /** When the note was last edited (epoch milliseconds), 0 when unknown — a small part of the score. */
  readonly updatedMs: number;
  /** Folded title, the tie-break between equal scores. */
  readonly sortTitle: string;
}

export interface ScanHit {
  readonly id: string;
  readonly cls: MatchClass;
  readonly score: number;
  /** Found only by tolerating a typo in the title or an alias ("close match"). */
  readonly fuzzy: boolean;
  /** The best passages first. */
  readonly snippets: readonly Snippet[];
  /** How many more lines of the note match beyond the passages returned. */
  readonly moreMatches: number;
}

const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Best score first; at equal scores an exact match before a close one, then by title and id: a total, repeatable order. */
function byScoreTitleId(a: Scored, b: Scored): number {
  return (
    b.classification.score - a.classification.score ||
    Number(a.classification.fuzzy) - Number(b.classification.fuzzy) ||
    titleCollator.compare(a.candidate.sortTitle, b.candidate.sortTitle) ||
    (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0)
  );
}

interface Scored {
  readonly candidate: ScanCandidate;
  readonly classification: Classification;
}

/** How many pages are classified between looks at the clock. */
const CLOCK_CHECK_EVERY = 16;

/**
 * Ranks candidates for one query, in steps small enough to run between frames.
 *
 * Every candidate gets one relevance score (see `matchPage.ts`) without its Markdown being parsed; they are then
 * ordered by it. A page found only through its body is CONFIRMED against the visible text when its turn comes — which
 * can only drop it (a match that was really a link destination, say) — and the parse is paid only as far as hits are
 * wanted, never for the whole vault. The order is total and deterministic: score, then title, then id.
 *
 * The work is split so a caller never has to block on all of it:
 *  - `step(budget)` does at most about `budgetMs` of work and says whether `wanted` hits are ready (or no more can
 *    be found). Scoring every page happens first, in as many steps as it takes; confirming hits follows.
 *  - `extend(count)` asks for `count` more hits and continues from exactly where the last one stopped — nothing is
 *    scored, sorted or confirmed twice, and a hit can never appear twice.
 *
 * A job is for one query and one snapshot of candidates; a new query or a changed vault is a new job.
 */
export class RankingJob {
  readonly hits: ScanHit[] = [];
  private readonly candidates: Iterator<ScanCandidate>;
  private readonly ordered: Scored[] = [];
  private readonly nowMs = Date.now();
  private classified = false;
  private cursor = 0;
  private wanted: number;

  constructor(
    private readonly query: ParsedQuery,
    candidates: Iterable<ScanCandidate>,
    wanted: number,
    private readonly now: () => number = () => performance.now()
  ) {
    this.candidates = candidates[Symbol.iterator]();
    this.wanted = wanted;
  }

  /** More hits exist beyond the ones wanted so far (some may turn out not to be real matches when confirmed). */
  get hasMore(): boolean {
    return this.classified && this.cursor < this.ordered.length;
  }

  /** True once the wanted number of hits are ready, or every candidate has been tried. */
  get isComplete(): boolean {
    return this.classified && (this.hits.length >= this.wanted || !this.hasMore);
  }

  extend(count: number): void {
    this.wanted = this.hits.length + count;
  }

  /** Works for about `budgetMs`; returns `isComplete`. */
  step(budgetMs: number): boolean {
    const deadline = this.now() + budgetMs;

    if (!this.classified && !this.classify(deadline)) {
      return false;
    }

    while (this.hits.length < this.wanted && this.hasMore) {
      this.confirmNext();

      if (this.now() >= deadline) {
        break;
      }
    }

    return this.isComplete;
  }

  /** Classifies candidates until done (true) or the deadline passes (false). */
  private classify(deadline: number): boolean {
    for (let count = 1; ; count++) {
      const next = this.candidates.next();

      if (next.done) {
        break;
      }

      const classification = classify(
        this.query,
        next.value.meta,
        next.value.body,
        recencyPoints(next.value.updatedMs, this.nowMs)
      );

      if (classification) {
        this.ordered.push({ candidate: next.value, classification });
      }

      if (count % CLOCK_CHECK_EVERY === 0 && this.now() >= deadline) {
        return false;
      }
    }

    this.ordered.sort(byScoreTitleId);
    this.classified = true;

    return true;
  }

  /** Takes the next best candidate; adds it as a hit unless confirming it shows it is not a match. */
  private confirmNext(): void {
    const query = this.query;
    const { candidate, classification } = this.ordered[this.cursor++]!;

    if (!classification.pendingBody) {
      // A page found by its title/alias/heading/tag still shows where its body says the same thing — when it does.
      const mentionsBody = query.prefilterTokens.some((token) => token !== '' && candidate.body.mayContain(token));
      const body = mentionsBody ? confirmBody(query, candidate.body) : undefined;

      this.hits.push({
        id: candidate.id,
        cls: classification.cls,
        score: classification.score,
        fuzzy: classification.fuzzy,
        snippets: body?.snippets ?? [],
        moreMatches: body?.moreMatches ?? 0,
      });

      return;
    }

    const { present, snippets, moreMatches } = confirmBody(query, candidate.body);
    const confirmed =
      classification.cls === 'body'
        ? present.every(Boolean)
        : query.tokens.every((token, index) => present[index] || metaIncludes(candidate.meta, token));

    if (confirmed) {
      this.hits.push({
        id: candidate.id,
        cls: classification.cls,
        score: classification.score,
        fuzzy: classification.fuzzy,
        snippets,
        moreMatches,
      });
    } else if (classification.fallback) {
      // The body did not match after all, but the page still matched by a close title: it takes its own, lower place.
      this.insertAhead({ candidate, classification: classification.fallback });
    }
  }

  /** Puts `scored` where its score belongs among the candidates not yet taken. */
  private insertAhead(scored: Scored): void {
    let low = this.cursor;
    let high = this.ordered.length;

    while (low < high) {
      const middle = (low + high) >> 1;

      if (byScoreTitleId(this.ordered[middle]!, scored) <= 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    this.ordered.splice(low, 0, scored);
  }
}

/** The whole ranking in one go: the best `limit` hits. */
export function rankPages(query: ParsedQuery, candidates: Iterable<ScanCandidate>, limit: number): ScanHit[] {
  const job = new RankingJob(query, candidates, limit);

  job.step(Number.POSITIVE_INFINITY);

  return job.hits;
}
