import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { GraphEdge } from '@core/vault/models/graph/GraphEdge';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { SourceRange } from '@core/presentation/getTagOccurrenceRanges';
import {
  getPageDisplayLabel,
  toPageDisplayLabelInput,
} from '@core/presentation/getPageDisplayLabel';

/** One source page that references the open page, once, however many times it does. */
export interface PageReference {
  readonly page: Page;
  /** Every place in `page` that links to or embeds the open page, in document order. */
  readonly ranges: readonly SourceRange[];
}

export interface PageReferences {
  /** Tasks whose own line links to or embeds the open page, by due date (undated last). */
  readonly tasks: readonly TaskOccurrence[];
  /** Notes that reference the open page, A–Z by display title. */
  readonly notes: readonly PageReference[];
  /** Daily notes that reference the open page, newest first. */
  readonly dailyNotes: readonly PageReference[];
}

const NONE: PageReferences = { tasks: [], notes: [], dailyNotes: [] };

/**
 * The inbound references to `pageId`, read from the Vault's knowledge graph — the one place that already
 * resolves links and embeds, and that already leaves archived pages out. Nothing here scans the vault: it
 * walks only the edges that point at this page, through the graph's own incoming index.
 *
 * Identity is the stable page id throughout (never a title or a path). A source that is the page itself, or
 * lives in Templates (a template's content is raw material, not a note — the same rule `Vault.tasks()` applies),
 * is not a reference.
 */
export function getPageReferences(vault: Vault, pageId: string): PageReferences {
  const edges = vault.knowledgeGraph().incomingEdges(pageId);

  if (edges.length === 0) {
    return NONE;
  }

  const edgesBySource = new Map<string, GraphEdge[]>();

  for (const edge of edges) {
    if (edge.sourcePageId === pageId) {
      continue;
    }

    const fromSource = edgesBySource.get(edge.sourcePageId);

    if (fromSource) {
      fromSource.push(edge);
    } else {
      edgesBySource.set(edge.sourcePageId, [edge]);
    }
  }

  const tasks: TaskOccurrence[] = [];
  const notes: PageReference[] = [];
  const dailyNotes: PageReference[] = [];

  for (const [sourceId, sourceEdges] of edgesBySource) {
    const source = vault.getPage(sourceId);

    if (
      !source ||
      vault.isPageEffectivelyArchived(source) ||
      vault.isFolderWithinReservedFolder(source.parentId, 'templates')
    ) {
      continue;
    }

    const ranges = toRanges(sourceEdges);
    const reference: PageReference = { page: source, ranges };

    (source.type === 'daily-note' ? dailyNotes : notes).push(reference);

    // A task references the page when a link or embed to it sits inside the task's own line.
    for (const task of source.analysis.tasks) {
      if (ranges.some((range) => isWithin(range, task))) {
        tasks.push(task);
      }
    }
  }

  return {
    tasks: tasks.sort(byDueDate),
    notes: notes.sort(byTitle),
    dailyNotes: dailyNotes.sort(byDateNewestFirst),
  };
}

/** The edges' offsets, deduplicated and in document order; an edge without a range reveals nothing. */
function toRanges(edges: readonly GraphEdge[]): readonly SourceRange[] {
  const ranges = new Map<string, SourceRange>();

  for (const edge of edges) {
    if (edge.startOffset !== undefined && edge.endOffset !== undefined) {
      ranges.set(`${edge.startOffset}:${edge.endOffset}`, { from: edge.startOffset, to: edge.endOffset });
    }
  }

  return [...ranges.values()].sort((a, b) => a.from - b.from);
}

function isWithin(range: SourceRange, task: TaskOccurrence): boolean {
  return (
    task.startOffset !== undefined &&
    task.endOffset !== undefined &&
    range.from >= task.startOffset &&
    range.to <= task.endOffset
  );
}

// ISO dates sort lexicographically. `Array.prototype.sort` is stable, so tasks tied on due date (and the
// undated ones) keep their source order.
function byDueDate(a: TaskOccurrence, b: TaskOccurrence): number {
  if (a.dueDate === b.dueDate) {
    return 0;
  }

  if (a.dueDate === undefined) {
    return 1;
  }

  if (b.dueDate === undefined) {
    return -1;
  }

  return a.dueDate < b.dueDate ? -1 : 1;
}

function byTitle(a: PageReference, b: PageReference): number {
  const title = (reference: PageReference) => getPageDisplayLabel(toPageDisplayLabelInput(reference.page)).text;

  return (
    title(a).localeCompare(title(b), undefined, { sensitivity: 'base' }) || a.page.id.localeCompare(b.page.id)
  );
}

// A Daily Note's name is its ISO date.
function byDateNewestFirst(a: PageReference, b: PageReference): number {
  return b.page.name.localeCompare(a.page.name);
}
