import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { Vault } from '../../vault/models/Vault';
import type { TaskOccurrence } from '../../vault/models/occurrences';
import type { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import {
  METADATA_TOKEN_PATTERN,
  TASK_LINE_PATTERN,
  type RecognizedMetadataKey,
} from '../../vault/ingest/extractors/TaskExtractor';

/**
 * A patch over a task's recognized inline metadata: a string sets/replaces
 * that key's value, null removes it, an absent key is left untouched.
 * Unrecognized keys already present on the line (e.g. @energy:high) are
 * never part of this patch's vocabulary and are never touched by it.
 */
export type TaskMetadataPatch = Partial<Record<RecognizedMetadataKey, string | null>>;

/**
 * Owns task mutation: toggling completion and setting/removing/updating
 * inline @key:value metadata. This is the facade ADR-012/014/016 already
 * named as blocking createTask/createTag's removal — a genuinely new
 * aggregate (a task occurrence within a page's body), following the same
 * shape PageOperations/FolderOperations do: read the Vault's current
 * durable state, decide the new content, enqueue through the one
 * Persistence Gate. No new PersistenceOperation kind — a task mutation
 * reuses the Gate's existing 'save' kind exactly the way
 * PageOperations.updateMetadata()'s persisted-page branch already does,
 * since neither originates from an open editor session and both persist
 * against page.source.markdown rather than a DocumentSession revision.
 *
 * Does not know about DocumentSession/SaveCoordinator — a task mutation
 * from the sidebar is not a document-revision event, same reasoning
 * updateMetadata() already documents for its own persisted-page branch.
 */
export class TaskOperations {
  constructor(
    private readonly vault: Vault,
    private readonly coordinator: PagePersistenceCoordinator
  ) {}

  /**
   * Checking a task stamps @completed with today's date; unchecking
   * removes it entirely. The checkbox marker remains the source of truth
   * for completed state — @completed only records when that happened.
   */
  public async toggleComplete(task: TaskOccurrence): Promise<void> {
    const completed = !task.completed;

    await this.mutate(task, {
      completed,
      metadata: { completed: completed ? toISODate(new Date()) : null },
    });
  }

  public async setDueDate(task: TaskOccurrence, dueDate: string): Promise<void> {
    await this.mutate(task, { metadata: { due: dueDate } });
  }

  public async removeDueDate(task: TaskOccurrence): Promise<void> {
    await this.mutate(task, { metadata: { due: null } });
  }

  /**
   * General-purpose metadata update for recognized keys — the entry point
   * toggleComplete()/setDueDate()/removeDueDate() themselves are built on.
   * Exists for callers that need to patch metadata without also changing
   * completed state.
   */
  public async updateMetadata(
    task: TaskOccurrence,
    patch: TaskMetadataPatch
  ): Promise<void> {
    await this.mutate(task, { metadata: patch });
  }

  private async mutate(
    task: TaskOccurrence,
    change: { completed?: boolean; metadata: TaskMetadataPatch }
  ): Promise<void> {
    if (task.rawText == null) {
      throw new Error(
        `Task "${task.text}" has no recorded source line — cannot locate it for mutation.`
      );
    }

    const rawText = task.rawText;
    const page = this.vault.getPage(task.sourcePageId);

    if (!page) {
      throw new Error(`Page not found: ${task.sourcePageId}`);
    }

    if (page.metadata.status === 'archived') {
      throw new Error(
        `Cannot edit archived page: ${page.id}. Restore it before editing.`
      );
    }

    const lines = page.source.markdown.split('\n');
    const lineIndex = lines.indexOf(rawText);

    // Not business policy — a structural precondition, the same category
    // as MoveService's occupied-path check (ARCHITECTURE_RULES rule 5's
    // amendment): the task's source line is no longer where this
    // TaskOccurrence says it is, so there is nothing safe to rewrite.
    if (lineIndex === -1) {
      throw new Error(
        `Could not locate task "${task.text}" in its source page — the page may have changed since this task was read.`
      );
    }

    lines[lineIndex] = this.rewriteLine(rawText, change);

    const result = await this.coordinator.enqueue(page.id, {
      kind: 'save',
      content: lines.join('\n'),
    });

    if (result.status === 'abandoned') {
      throw new Error(`Failed to update task "${task.text}": ${result.reason}`);
    }
  }

  private rewriteLine(
    rawLine: string,
    change: { completed?: boolean; metadata: TaskMetadataPatch }
  ): string {
    const match = rawLine.match(TASK_LINE_PATTERN);

    if (!match) {
      throw new Error(
        `Task source line no longer matches the expected format: "${rawLine}"`
      );
    }

    const [, indent, currentMarker, rest] = match;
    const marker =
      change.completed === undefined ? currentMarker : change.completed ? 'x' : ' ';

    return `${indent}- [${marker}] ${this.applyMetadataPatch(rest ?? '', change.metadata)}`;
  }

  /**
   * Rewrites only the keys named in `patch`, in place at their existing
   * position when present, appended (never duplicated) when not. Every
   * other token — unrecognized keys included — passes through untouched,
   * so "unknown metadata is preserved exactly as written" falls out of
   * this loop rather than needing a special case for it.
   */
  private applyMetadataPatch(rest: string, patch: TaskMetadataPatch): string {
    const pending = new Map(Object.entries(patch)) as Map<
      RecognizedMetadataKey,
      string | null
    >;

    let rewritten = rest.replace(METADATA_TOKEN_PATTERN, (token, key: string) => {
      const recognizedKey = key as RecognizedMetadataKey;

      if (!pending.has(recognizedKey)) {
        return token;
      }

      const value = pending.get(recognizedKey);
      pending.delete(recognizedKey);

      return value == null ? '' : `@${recognizedKey}:${value}`;
    });

    for (const [key, value] of pending) {
      // A key patched to null that was never present on the line has
      // nothing to remove — not an addition, not an error.
      if (value == null) {
        continue;
      }

      rewritten = `${rewritten} @${key}:${value}`;
    }

    return rewritten.trim().replace(/ {2,}/g, ' ');
  }
}
