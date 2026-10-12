import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { GraphEdge } from '@core/vault/models/graph/GraphEdge';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { SourceRange } from '@core/presentation/getTagOccurrenceRanges';
import { extractReferenceLine } from './extractReferenceLine';
import {
  getPageDisplayLabel,
  toPageDisplayLabelInput,
} from '@core/presentation/getPageDisplayLabel';

/** One line of a source page that references the open page, once, however many times it does. */
export interface PageReference {
  readonly page: Page;
  /** Offset where the line starts: with the page, the identity of this entry. */
  readonly lineFrom: number;
  /** Every place on this line that links to or embeds the open page, in document order. */
  readonly ranges: readonly SourceRange[];
  /**
   * The referencing line, and only that line, as its own document — what the entry's read-only editor preview
   * renders. `null` when it should not be previewed in the editor (it holds an embed, or is very long; see
   * `extractReferenceLine`): the entry then shows `excerpt` through the compact renderer instead.
   */
  readonly line: string | null;
  /** The referencing line, trimmed of its list/heading marker — the compact fallback for `line`. */
  readonly excerpt: string;
}

/** A task that references the open page, with the page its line lives in. */
export interface TaskReference {
  readonly task: TaskOccurrence;
  readonly page: Page;
}

export interface PageReferences {
  /**
   * Tasks whose own line links to or embeds the open page: open dated (due date ascending), open undated,
   * then completed (most recently completed first; ones with no completion date by due date). Ties go to
   * the most recently modified source note.
   */
  readonly tasks: readonly TaskReference[];
  /**
   * Notes that reference the open page from outside a task line (a note whose only references are tasks is
   * represented by those task entries, not listed again), most recently modified first, then A–Z by title; a page's own lines stay in document order.
   */
  readonly notes: readonly PageReference[];
  /** Daily notes that reference the open page from outside a task line, newest first. */
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

  const tasks: TaskReference[] = [];
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

    // A task references the page when a link or embed to it sits inside the task's own line.
    const referencingTasks = source.analysis.tasks.filter((task) =>
      sourceEdges.some((edge) => isEdgeWithin(edge, task))
    );

    for (const task of referencingTasks) {
      tasks.push({ task, page: source });
    }

    // The source is also listed as a note only for references that are not on a task line — those are already
    // the task entries, and nothing is listed twice. Its excerpt and its reveal come from those references.
    const noteEdges = sourceEdges.filter((edge) => !referencingTasks.some((task) => isEdgeWithin(edge, task)));

    if (noteEdges.length > 0) {
      const markdown = source.source.markdown;
      const ranges = toRanges(noteEdges);

      // One entry per line: every reference on the same line is that entry's ranges.
      const byLine = new Map<number, { line: string | null; ranges: SourceRange[] }>();

      for (const range of ranges) {
        const { from, text } = extractReferenceLine(markdown, range.from);
        const entry = byLine.get(from);

        if (entry) {
          entry.ranges.push(range);
        } else {
          byLine.set(from, { line: text, ranges: [range] });
        }
      }

      for (const [lineFrom, { line, ranges: lineRanges }] of byLine) {
        (source.type === 'daily-note' ? dailyNotes : notes).push({
          page: source,
          lineFrom,
          ranges: lineRanges,
          line,
          excerpt: toExcerpt(markdown, lineRanges),
        });
      }
    }
  }

  return {
    tasks: tasks.sort(byTaskOrder),
    notes: notes.sort(byModifiedThenTitle),
    dailyNotes: dailyNotes.sort(byDateNewestFirst),
  };
}

// A list, task, quote or heading marker at the start of a line is structure, not context.
const LINE_MARKER = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>+\s*|#{1,6}\s+)/;

/** The line holding the first reference, as the context to show beside the source page's title. */
function toExcerpt(markdown: string, ranges: readonly SourceRange[]): string {
  const first = ranges[0];

  if (!first) {
    return '';
  }

  const start = markdown.lastIndexOf('\n', first.from - 1) + 1;
  const end = markdown.indexOf('\n', first.from);

  return markdown
    .slice(start, end === -1 ? markdown.length : end)
    .replace(LINE_MARKER, '')
    .trim();
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

function isEdgeWithin(edge: GraphEdge, task: TaskOccurrence): boolean {
  return (
    edge.startOffset !== undefined &&
    edge.endOffset !== undefined &&
    task.startOffset !== undefined &&
    task.endOffset !== undefined &&
    edge.startOffset >= task.startOffset &&
    edge.endOffset <= task.endOffset
  );
}

// ISO dates and timestamps sort lexicographically. `Array.prototype.sort` is stable, so anything still tied
// keeps its source order.

/** Newest first; a page with no `modified` stamp sorts last. */
function byModifiedDesc(a: Page, b: Page): number {
  const left = a.metadata.updatedAt;
  const right = b.metadata.updatedAt;

  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left < right ? 1 : -1;
}

/** Oldest first; no date sorts last. */
function byDateAsc(a: string | undefined, b: string | undefined): number {
  if (a === b) {
    return 0;
  }

  if (a === undefined) {
    return 1;
  }

  if (b === undefined) {
    return -1;
  }

  return a < b ? -1 : 1;
}

/** The task list's sections, in order: open dated, open undated, completed (by completion), completed (without one). */
function taskSection({ task }: TaskReference): 0 | 1 | 2 | 3 {
  if (!task.completed) {
    return task.dueDate === undefined ? 1 : 0;
  }

  return task.completedAt === undefined ? 3 : 2;
}

// A task has no timestamp of its own, so a tie goes to the note it lives in: the one modified most recently.
function byTaskOrder(a: TaskReference, b: TaskReference): number {
  const sectionA = taskSection(a);
  const sectionB = taskSection(b);

  if (sectionA !== sectionB) {
    return sectionA - sectionB;
  }

  switch (sectionA) {
    case 0:
    case 3:
      // Due date ascending (undated last): the only ordering for a completed task that has no completion date.
      return byDateAsc(a.task.dueDate, b.task.dueDate) || byModifiedDesc(a.page, b.page);
    case 2:
      // Most recently completed first.
      return -byDateAsc(a.task.completedAt, b.task.completedAt) || byModifiedDesc(a.page, b.page);
    default:
      return byModifiedDesc(a.page, b.page);
  }
}

function byModifiedThenTitle(a: PageReference, b: PageReference): number {
  return byModifiedDesc(a.page, b.page) || byTitle(a, b) || a.lineFrom - b.lineFrom;
}

function byTitle(a: PageReference, b: PageReference): number {
  const title = (reference: PageReference) => getPageDisplayLabel(toPageDisplayLabelInput(reference.page)).text;

  return (
    title(a).localeCompare(title(b), undefined, { sensitivity: 'base' }) || a.page.id.localeCompare(b.page.id)
  );
}

// A Daily Note's name is its ISO date.
function byDateNewestFirst(a: PageReference, b: PageReference): number {
  return b.page.name.localeCompare(a.page.name) || a.lineFrom - b.lineFrom;
}
