import type { Vault } from '../../vault/models/Vault';
import type { VaultQuery } from '../../vault/queries/VaultQuery';
import type { Page, PageType } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';
import type { VaultResource, VaultResourceKind } from '../../vault/models/VaultResource';
import type { Workspace } from '../../workspace/Workspace';
import type { PageOperations } from '../page/PageOperations';
import type { MembershipSelector } from '../membership/MembershipSelector';
import type { DocumentRevision } from '../../engine/DocumentRevision';
import { resolveEffectivePageDates } from '../../vault/models/effectivePageDates';
import { normalizeTagName } from '../../vault/models/Tag';
import { dailyNoteSearchText } from '../../presentation/dailyNoteSearchText';
import { getPageDisplayLabel } from '../../presentation/getPageDisplayLabel';
import { getResourceDisplayName } from '../../presentation/getResourceDisplayName';
import { foldString } from './foldText';
import {
  BodyText,
  highlightRanges,
  parseQuery,
  tokenMatches,
  type MatchClass,
  type Snippet,
} from './matchPage';
import { RankingJob, type ScanCandidate, type ScanHit } from './rankPages';

/** How many results a search returns at first — and how many more each "show more" brings. */
export const SEARCH_PAGE_SIZE = 50;

/** What a result opens: a note or daily note, a template (a note in the Templates folder), an asset file, or a folder. */
export type SearchResultKind = 'note' | 'template' | 'asset' | 'folder';

export interface SearchResult {
  /** The page id — or, for a draft, the id of its open document; for an asset or folder, its own id. */
  readonly id: string;
  readonly kind: SearchResultKind;
  /** The page type; null for an asset or a folder. */
  readonly type: PageType | null;
  /** Which kind of file, for an asset result. */
  readonly assetKind?: VaultResourceKind;
  readonly isDraft: boolean;
  /** The title as the app shows it (a Daily Note's date, a placeholder for an untitled note). */
  readonly title: string;
  readonly titleHighlights: readonly { readonly from: number; readonly to: number }[];
  /** The page's folders, outermost first. */
  readonly folders: readonly string[];
  readonly icon: string | null;
  /** The best place the query was found. */
  readonly matchedBy: MatchClass;
  /** Found only by tolerating a typo in the title or an alias — shown as a "close match". */
  readonly closeMatch: boolean;
  /** How many more lines of the note match beyond the snippets. */
  readonly moreMatches: number;
  /** The alias that matched, when `matchedBy` is `alias`. */
  readonly matchedAlias?: string;
  /** The ranges of `matchedAlias` that matched the query (the typo's actual text for a close match). */
  readonly aliasHighlights?: readonly { readonly from: number; readonly to: number }[];
  /** The tags that matched, when `matchedBy` is `tag`. */
  readonly matchedTags: readonly string[];
  /** Up to three lines of the note's visible text that hold the query, ready to show. */
  readonly snippets: readonly Snippet[];
}

interface Snapshot {
  readonly pages: Page[];
  readonly openIds: string[];
  readonly resources: VaultResource[];
  readonly folders: Folder[];
}

/** An entity with no body, aliases or tags (an asset file, a folder): found by its name alone. */
function titleOnlyCandidate(id: string, name: string, updatedMs: number): ScanCandidate {
  const title = foldString(name);

  return { id, meta: { title, aliases: [], headings: [], tags: [] }, sortTitle: title, updatedMs, body: new BodyText('') };
}

/** What one page contributes to a search before the query is known — computed once per immutable `Page`. */
interface PageFacts {
  /** The page as the Vault has it; an open session or an unsaved title is laid over this per search. */
  readonly candidate: ScanCandidate;
  readonly tags: readonly string[];
}

/**
 * The title as the app SHOWS it, which is what the user searches by: a Daily Note's date spellings, a note's own name,
 * and for a note with no name of its own (stored as "Untitled") the placeholder it is shown as, "New note".
 */
function searchableTitle(type: PageType, name: string): string {
  return type === 'daily-note' ? dailyNoteSearchText(name) : getPageDisplayLabel({ type, name, description: null, markdown: '' }).text;
}

function foldTag(tag: string): string {
  return foldString(tag).replace(/[-_]+/g, ' ');
}

/**
 * Searches notes, daily notes and templates (titles, aliases, tags and visible body text, one result per page), asset
 * files (their name without the extension) and folders (their name) — one ranked list, the same relevance rules.
 *
 * A read-only Application-layer projection (ADR-061), like `EffectivePageState`: it holds no subscription and no
 * state of its own beyond disposable memos keyed by the immutable objects they were derived from, so it needs no
 * lifecycle. It reads each page from the Vault and OVERLAYS what the user is editing right now — the open
 * `DocumentSession`'s current revision, a draft's title and tags, and an unsaved title (`getLiveTitle`) — so a
 * result never waits for autosave. Observers learn *when* to search again from `EffectivePageState.subscribe`,
 * which already aggregates Vault, Workspace and every open session; nothing here (or in the Vault) is told about
 * search.
 *
 * Archived content (pages, assets, folders), dot-prefixed names, system folders and the folders inside them, and remote
 * (URL) assets are not searched. Assets and folders have only a title, so every query reaches them as a title match.
 */
export class SearchService {
  private readonly facts = new WeakMap<Page, PageFacts>();
  private readonly sessionBodies = new WeakMap<DocumentRevision, BodyText>();
  private readonly resourceCandidates = new WeakMap<VaultResource, ScanCandidate>();
  private readonly folderCandidates = new WeakMap<Folder, ScanCandidate>();

  constructor(
    private readonly vault: Vault,
    private readonly query: VaultQuery,
    private readonly workspace: Workspace,
    private readonly pageOperations: PageOperations,
    private readonly membershipSelector: MembershipSelector
  ) {}

  /**
   * Starts a search that runs in steps (`SearchJob.step`), so the caller can keep the UI responsive however large the
   * vault is, drop it the moment the query changes, and ask for more results with `loadMore`. Null for a query with
   * nothing to look for. The job searches the pages as they are when it starts.
   */
  public startSearch(
    rawQuery: string,
    wanted: number = SEARCH_PAGE_SIZE,
    now?: () => number
  ): SearchJob | undefined {
    const query = parseQuery(rawQuery);

    if (!query) {
      return undefined;
    }

    const snapshot = this.snapshot();
    const ranking = new RankingJob(query, this.candidates(snapshot), wanted, now);

    return new SearchJob(ranking, query.tokens, (hit) => this.toResult(hit, query.tokens));
  }

  /** The whole search in one go — the first `limit` results. For callers that can afford to wait. */
  public search(rawQuery: string, limit: number = SEARCH_PAGE_SIZE): SearchResult[] {
    const job = this.startSearch(rawQuery, limit);

    if (!job) {
      return [];
    }

    job.step(Number.POSITIVE_INFINITY);

    return job.results;
  }

  /**
   * Prepares every page for searching in steps (`step(budgetMs)` returns true when done), so the first query after
   * opening the overlay finds the work already done. Purely a head start: a search never depends on it.
   */
  public startWarmup(now: () => number = () => performance.now()): { step(budgetMs: number): boolean } {
    const pages = this.snapshot().pages;
    let next = 0;

    return {
      step: (budgetMs) => {
        const deadline = now() + budgetMs;

        while (next < pages.length) {
          const page = pages[next++]!;

          if (this.isSearchable(page)) {
            this.factsFor(page).candidate.body.prefilter;
          }

          if (now() >= deadline) {
            break;
          }
        }

        return next >= pages.length;
      },
    };
  }

  /** The pages and open documents to search, fixed now so the vault changing mid-search cannot disturb the iteration. */
  private snapshot(): Snapshot {
    return {
      pages: Array.from(this.vault.pages()),
      openIds: [...this.workspace.openPages],
      resources: this.membershipSelector.getAllVisibleResources(),
      folders: Array.from(this.vault.folders()).filter((folder) => this.isSearchableFolder(folder)),
    };
  }

  /** Candidates made one at a time as they are asked for: the per-page work happens inside the search's own steps. */
  private *candidates(snapshot: Snapshot): Generator<ScanCandidate> {
    for (const page of snapshot.pages) {
      if (this.isSearchable(page)) {
        yield this.candidateFor(page);
      }
    }

    for (const id of snapshot.openIds) {
      if (!this.vault.getPage(id)) {
        const draft = this.draftCandidate(id);

        if (draft) {
          yield draft;
        }
      }
    }

    for (const resource of snapshot.resources) {
      yield this.resourceCandidate(resource);
    }

    for (const folder of snapshot.folders) {
      yield this.folderCandidate(folder);
    }
  }

  /**
   * A folder the user can see in the workspace: not dot-hidden, not archived, and inside a Workspace root folder — so
   * system folders (Templates, Archive, Daily Notes' year and month folders, …) and the Assets storage folder are out.
   */
  private isSearchableFolder(folder: Folder): boolean {
    if (this.membershipSelector.isEntityEffectivelyArchived(folder)) {
      return false;
    }

    const lineage = this.query.getFolderAndAncestorIds(folder.id).map((id) => this.vault.getFolder(id));
    const root = lineage[lineage.length - 1];

    return (
      root !== undefined &&
      this.membershipSelector.isWorkspaceFolder(root) &&
      lineage.every((member) => member !== undefined && this.membershipSelector.isVisibleFolder(member))
    );
  }

  /** An asset's title is its file name without the extension — what every list in the app shows. */
  private resourceCandidate(resource: VaultResource): ScanCandidate {
    let candidate = this.resourceCandidates.get(resource);

    if (!candidate) {
      candidate = titleOnlyCandidate(resource.id, getResourceDisplayName(resource), Date.parse(resource.metadata?.modifiedAt ?? '') || 0);
      this.resourceCandidates.set(resource, candidate);
    }

    return candidate;
  }

  private folderCandidate(folder: Folder): ScanCandidate {
    let candidate = this.folderCandidates.get(folder);

    if (!candidate) {
      candidate = titleOnlyCandidate(folder.id, folder.name, 0);
      this.folderCandidates.set(folder, candidate);
    }

    return candidate;
  }
  private isSearchable(page: Page): boolean {
    return (
      !this.vault.isPageEffectivelyArchived(page) && this.membershipSelector.isVisiblePage(page)
    );
  }

  private factsFor(page: Page): PageFacts {
    let facts = this.facts.get(page);

    if (!facts) {
      const tagNames = new Map<string, string>();

      for (const tag of [...(page.metadata.tags ?? []), ...page.analysis.tags.map((occurrence) => occurrence.name)]) {
        tagNames.set(normalizeTagName(tag), tag);
      }

      const tags = [...tagNames.values()];
      const titleText = searchableTitle(page.type, page.name);

      facts = {
        candidate: {
          id: page.id,
          meta: {
            title: foldString(titleText),
            aliases: (page.metadata.aliases ?? []).map(foldString),
            headings: page.analysis.headings.map((heading) => foldString(heading.text)),
            tags: tags.map(foldTag),
          },
          sortTitle: foldString(titleText),
          updatedMs: Date.parse(resolveEffectivePageDates(page).updatedAt ?? '') || 0,
          body: new BodyText(page.source.markdown),
        },
        tags,
      };
      this.facts.set(page, facts);
    }

    return facts;
  }

  /** The page as it is right now: the Vault's facts, with the open session's body and an unsaved title laid over. */
  private candidateFor(page: Page): ScanCandidate {
    const { candidate } = this.factsFor(page);
    const session = this.pageOperations.getSession(page.id);
    const liveTitle = this.pageOperations.getLiveTitle(page.id);

    if (!session && liveTitle === undefined) {
      return candidate;
    }

    return {
      ...candidate,
      meta: liveTitle === undefined ? candidate.meta : { ...candidate.meta, title: foldString(searchableTitle(page.type, liveTitle)) },
      body: session ? this.sessionBody(session.currentRevision) : candidate.body,
      sortTitle: liveTitle === undefined ? candidate.sortTitle : foldString(searchableTitle(page.type, liveTitle)),
    };
  }

  private sessionBody(revision: DocumentRevision): BodyText {
    let body = this.sessionBodies.get(revision);

    if (!body) {
      body = new BodyText(revision.markdown);
      this.sessionBodies.set(revision, body);
    }

    return body;
  }

  /** A draft (an open document with no page yet): its title and tags from `DraftInfo`, its body from the session. */
  private draftCandidate(id: string): ScanCandidate | undefined {
    const draft = this.pageOperations.getDraft(id);

    if (!draft) {
      return undefined;
    }

    const session = this.pageOperations.getSession(id);
    const title = draft.title ?? '';

    if (title.startsWith('.')) {
      return undefined;
    }

    return {
      id,
      meta: {
        title: foldString(searchableTitle(draft.type, title)),
        aliases: [],
        headings: [],
        tags: (draft.tags ?? []).map(foldTag),
      },
      body: session ? this.sessionBody(session.currentRevision) : new BodyText(''),
      updatedMs: Date.now(), // a draft is what the user is working on right now
      sortTitle: foldString(searchableTitle(draft.type, title)),
    };
  }

  /** Undefined when the entity has since gone (deleted, or a draft closed) — a result for it would open nothing. */
  private toResult(hit: ScanHit, tokens: readonly string[]): SearchResult | undefined {
    const page = this.vault.getPage(hit.id);
    const draft = page ? undefined : this.pageOperations.getDraft(hit.id);

    if (!page && !draft) {
      return this.toFileResult(hit, tokens);
    }

    const candidate = page ? this.candidateFor(page) : this.draftCandidate(hit.id);

    if (!candidate) {
      return undefined;
    }

    const type: PageType = page ? page.type : (draft?.type ?? 'note');
    const liveTitle = this.pageOperations.getLiveTitle(hit.id);
    const name = liveTitle ?? (page ? page.name : (draft?.title ?? ''));
    const title = getPageDisplayLabel({ type, name, description: null, markdown: '' }).text;
    const facts = page ? this.factsFor(page) : undefined;
    const folderId = page ? page.parentId : (draft?.folderId ?? null);

    return {
      id: hit.id,
      kind: this.membershipSelector.isInTemplatesFolder(folderId) ? 'template' : 'note',
      type,
      isDraft: !page,
      title,
      titleHighlights: highlightRanges(title, tokens, true),
      folders: this.folderNames(folderId),
      icon: page ? page.metadata.icon : null,
      matchedBy: hit.cls,
      closeMatch: hit.fuzzy,
      moreMatches: hit.moreMatches,
      ...(hit.cls === 'alias' && page ? this.aliasFields(page, candidate, tokens) : {}),
      matchedTags: hit.cls === 'tag' ? this.matchedTags(facts?.tags ?? draft?.tags ?? [], candidate, tokens) : [],
      snippets: hit.snippets,
    };
  }

  /** An asset or a folder: only a title (and where it lives) to show. */
  private toFileResult(hit: ScanHit, tokens: readonly string[]): SearchResult | undefined {
    const resource = this.vault.getResource(hit.id);
    const folder = resource ? undefined : this.vault.getFolder(hit.id);

    if (!resource && !folder) {
      return undefined;
    }

    const title = resource ? getResourceDisplayName(resource) : (folder?.name ?? '');
    const parentId = resource ? resource.parentId : (folder?.parentId ?? null);

    return {
      id: hit.id,
      kind: resource ? 'asset' : 'folder',
      type: null,
      ...(resource ? { assetKind: resource.kind } : {}),
      isDraft: false,
      title,
      titleHighlights: highlightRanges(title, tokens, true),
      folders: this.folderNames(parentId),
      icon: folder ? folder.metadata.icon : null,
      matchedBy: hit.cls,
      closeMatch: hit.fuzzy,
      moreMatches: 0,
      matchedTags: [],
      snippets: [],
    };
  }

  private aliasFields(
    page: Page,
    candidate: ScanCandidate,
    tokens: readonly string[]
  ): Pick<SearchResult, 'matchedAlias' | 'aliasHighlights'> {
    const matchedAlias = this.matchedAlias(page, candidate, tokens);

    return matchedAlias === undefined ? {} : { matchedAlias, aliasHighlights: highlightRanges(matchedAlias, tokens, true) };
  }

  private matchedAlias(page: Page, candidate: ScanCandidate, tokens: readonly string[]): string | undefined {
    const aliases = page.metadata.aliases ?? [];
    const folded = candidate.meta.aliases;
    const exact = aliases.findIndex((_, index) => tokens.every((token) => tokenMatches(folded[index] ?? '', token)));

    // Found by a typo: the alias whose words the query was close to.
    return aliases[exact >= 0 ? exact : folded.findIndex((alias) => highlightRanges(alias, tokens, true).length > 0)];
  }

  private matchedTags(tags: readonly string[], candidate: ScanCandidate, tokens: readonly string[]): string[] {
    return tags.filter((_, index) => tokens.some((token) => tokenMatches(candidate.meta.tags[index] ?? '', token)));
  }

  private folderNames(folderId: string | null): string[] {
    return this.query
      .getFolderAndAncestorIds(folderId)
      .reverse()
      .map((id) => this.vault.getFolder(id)?.name ?? '');
  }
}

/**
 * One search in progress: call `step` (a few milliseconds at a time) until it returns true, read `results` as they
 * become available, and `loadMore` for the next page of them. Created by `SearchService.startSearch`; one job is one
 * query — a changed query or vault is a new job, and a superseded job is simply dropped.
 */
export class SearchJob {
  readonly results: SearchResult[] = [];
  private mapped = 0;

  constructor(
    private readonly ranking: RankingJob,
    readonly tokens: readonly string[],
    private readonly toResult: (hit: ScanHit) => SearchResult | undefined
  ) {}

  /** Works for about `budgetMs`; true once the wanted results are ready (or nothing more can be found). */
  step(budgetMs: number): boolean {
    const complete = this.ranking.step(budgetMs);

    for (; this.mapped < this.ranking.hits.length; this.mapped++) {
      const result = this.toResult(this.ranking.hits[this.mapped]!);

      if (result) {
        this.results.push(result);
      }
    }

    return complete;
  }

  get isComplete(): boolean {
    return this.ranking.isComplete;
  }

  /** More pages may match beyond the results so far (a few of them may still turn out not to). */
  get hasMore(): boolean {
    return this.ranking.hasMore;
  }

  /** Asks for `count` more results; `step` then finds them, continuing from where the last results stopped. */
  loadMore(count: number = SEARCH_PAGE_SIZE): void {
    this.ranking.extend(count);
  }
}
