import type { TaskTransferRecord, TaskTransferRecoveryStore } from '../../vault/persistence/TaskTransferRecoveryStore';
import { DailyNotePath } from '../../vault/ingest/DailyNotePath';
import { TaskExtractor } from '../../vault/ingest/extractors/TaskExtractor';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { TaskOccurrence } from '../../vault/models/occurrences';
import { MutateBodyAbandonedError, type PageOperations } from '../page/PageOperations';
import {
  BARE_DATE_PATTERN,
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

/** The occurrence fields locateLine() resolves a task by — see TaskOccurrence's positional-identity note. */
interface TaskSourcePosition {
  readonly rawText: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

/**
 * Owns task mutation: toggling completion and setting/removing/updating
 * inline @key:value metadata. This is the facade ADR-012/014/016 already
 * named as blocking createTask/createTag's removal — a genuinely new
 * aggregate (a task occurrence within a page's body), following the same
 * shape PageOperations/FolderOperations do: decide the new content, then
 * delegate persistence to the one owning broker.
 *
 * Per ADR-031, a task mutation is an app-initiated body mutation like any
 * other — it does not read Vault or the Persistence Gate directly, and it
 * does not know about DocumentSession/SaveCoordinator either. It computes
 * a pure Markdown transform (line lookup + rewrite) and hands it to
 * PageOperations.mutateBody(), which is the sole broker deciding whether
 * that transform runs against an open DocumentSession or the Vault's
 * durable page.source.markdown. This class owns only what the mutation
 * *is* (task-line semantics), never *how* it reaches the document.
 */
export class TaskOperations {
  constructor(
    private readonly pageOperations: PageOperations,
    private readonly transferRecovery?: TaskTransferRecoveryStore,
    private readonly normalizeForRecovery: (markdown: string) => string = (markdown) => markdown
  ) {}

  private tidyPending: Promise<void> | undefined;

  private async mutateTaskBody(
    pageId: string,
    transform: (markdown: string) => string
  ): Promise<void> {
    if (this.pageOperations.isTaskInbox(pageId)) {
      if (this.tidyPending)
        throw new Error('Finish Tidy up before changing Inbox tasks');
      const recovery = this.requireRecovery();
      const pending = await recovery.load();
      if (pending) {
        if (
          pending.inboxPageId === pageId &&
          pending.after === removeTaskLines(pending.before) &&
          destinationsSaved(pending) &&
          this.pageOperations.getBodyForMutation(pageId) === pending.after
        ) {
          await recovery.save(pending, null);
        } else throw new Error('Finish Tidy up before changing Inbox tasks');
      }
      if (legacyTransferId(this.pageOperations.getBodyForMutation(pageId)))
        throw new Error('Finish Tidy up before changing Inbox tasks');
    }
    return this.pageOperations.mutateBody(pageId, (markdown) => {
      if (this.pageOperations.isTaskInbox(pageId) && this.tidyPending)
        throw new Error('Finish Tidy up before changing Inbox tasks');
      return transform(markdown);
    });
  }

  private requireRecovery(): TaskTransferRecoveryStore {
    if (!this.transferRecovery)
      throw new Error('Task transfer recovery is unavailable');
    return this.transferRecovery;
  }

  /** Transfers only task lines; recovery bookkeeping never enters Markdown. */
  public tidyInbox(vaultRoot: string, inboxPageId: string): Promise<void> {
    if (!this.pageOperations.isTaskInbox(inboxPageId))
      return Promise.reject(new Error('The Task Inbox is no longer available'));
    if (this.tidyPending) return this.tidyPending;
    const work = this.runTidyInbox(vaultRoot, inboxPageId);
    this.tidyPending = work;
    void work
      .finally(() => {
        if (this.tidyPending === work) this.tidyPending = undefined;
      })
      .catch(() => {});
    return work;
  }

  private async runTidyInbox(
    vaultRoot: string,
    inboxPageId: string
  ): Promise<void> {
    const recovery = this.requireRecovery();
    let record = await recovery.load();
    if (record && record.inboxPageId !== inboxPageId)
      throw new Error('Another Inbox transfer needs recovery');
    if (!record) {
      let before = '';
      // Drain earlier source mutations through the existing broker before planning the transfer.
      await this.pageOperations.mutateBodyAndSave(inboxPageId, (body) => {
        before = body;
        return body;
      });
      const tasks = datedTasks(before);
      if (!tasks.length) return;
      const legacyId = legacyTransferId(before);
      record = {
        version: 1,
        id: crypto.randomUUID(),
        inboxPageId,
        before,
        after: removeTaskLines(before),
        destinations: [],
        ...(legacyId ? { legacyId } : {}),
      };
      await recovery.save(null, record);
    }
    if (record.after !== removeTaskLines(record.before))
      throw new Error(
        'The task transfer recovery record is invalid; Inbox tasks were kept'
      );
    const source = this.pageOperations.getBodyForMutation(inboxPageId);
    if (source === record.after && destinationsSaved(record)) {
      await recovery.save(record, null);
      return;
    }
    if (source !== record.before)
      throw new Error('Inbox changed during Tidy up; its tasks were kept');
    const tasks = datedTasks(record.before);
    const dates = [...new Set(tasks.map((task) => task.dueDate!))];
    if (
      new Set(record.destinations.map((d) => d.date)).size !==
        record.destinations.length ||
      record.destinations.some((d) => !dates.includes(d.date))
    )
      throw new Error(
        'The task transfer destinations are invalid; Inbox tasks were kept'
      );
    for (const date of dates) {
      const destinationId = await this.pageOperations.ensureAtPath(
        DailyNotePath.absoluteFrom(vaultRoot, toDate(date)),
        { type: 'daily-note' }
      );
      const lines = tasks
        .filter((task) => task.dueDate === date)
        .map((task) => task.rawText);
      const block = lines.join('\n');
      let destination = record.destinations.find((d) => d.date === date);
      if (destination && destination.pageId !== destinationId) {
        const current = this.normalizeForRecovery(
          this.pageOperations.getBodyForMutation(destinationId)
        );
        if (
          current !== destination.after &&
          (destination.state === 'saved' || current !== destination.before)
        )
          throw new Error(
            'A destination Daily Note changed; Inbox tasks were kept'
          );
        const adopted = { ...destination, pageId: destinationId };
        const next: TaskTransferRecord = {
          ...record,
          destinations: record.destinations.map((d) =>
            d.date === date ? adopted : d
          ),
        };
        await recovery.save(record, next);
        record = next;
        destination = adopted;
      }
      if (!destination) {
        const body = this.pageOperations.getBodyForMutation(destinationId);
        // Read old receipts only for compatibility; new transfers never generate them.
        const existingReceipt =
          record.legacyId &&
          body.includes(
            `<!-- clutter-inbox-transfer ${record.legacyId}:${date} -->`
          );
        if (existingReceipt && !containsTaskLines(body, lines))
          throw new Error(
            'Previously moved tasks changed; Inbox tasks were kept'
          );
        destination = {
          date,
          pageId: destinationId,
          before: this.normalizeForRecovery(body),
          after: this.normalizeForRecovery(
            existingReceipt ? body : insertTaskBlock(body, block)
          ),
          state: existingReceipt ? 'saved' : 'prepared',
        };
        const next: TaskTransferRecord = {
          ...record,
          destinations: [...record.destinations, destination],
        };
        await recovery.save(record, next);
        record = next;
      }
      if (destination.state === 'saved') continue;
      const prepared = destination;
      await this.pageOperations.mutateBodyAndSave(destinationId, (body) => {
        const current = this.normalizeForRecovery(body);
        if (current === prepared.after) return body;
        if (current !== prepared.before)
          throw new Error(
            'A destination Daily Note changed; Inbox tasks were kept'
          );
        return insertTaskBlock(body, block);
      });
      const next: TaskTransferRecord = {
        ...record,
        destinations: record.destinations.map((d) =>
          d.date === date ? { ...d, state: 'saved' as const } : d
        ),
      };
      await recovery.save(record, next);
      record = next;
    }
    for (const destination of record.destinations) {
      if (
        this.normalizeForRecovery(
          this.pageOperations.getBodyForMutation(destination.pageId)
        ) !== destination.after
      )
        throw new Error(
          'A destination Daily Note changed; Inbox tasks were kept'
        );
    }
    const completed = record;
    await this.pageOperations.mutateBodyAndSave(inboxPageId, (body) => {
      if (body === completed.after) return body;
      if (body !== completed.before)
        throw new Error('Inbox changed during Tidy up; its tasks were kept');
      return completed.after;
    });
    await recovery.save(record, null);
  }

  /**
   * Inserts a new task line into `pageId`'s body, immediately before the
   * body's first existing task line — the newest task is always the first
   * one in the file (and therefore first in the Daily Notes sidebar for
   * that date), rather than buried at the end after a day of appends. Text
   * before that first task line (frontmatter is never part of this string
   * at all — see PageBuilder/FrontmatterSerializer, which parse it out
   * separately — but also any leading prose/headings a user wrote) is left
   * exactly where it was; only the task area itself is reordered. A body
   * with no existing task line becomes the document's own first line
   * instead, for the same "newest first" reason, with every other line
   * preserved immediately after it.
   *
   * The create half of this facade's mutation surface, following the exact
   * shape mutate()/mutateDate() already use: decide the new content,
   * delegate persistence to PageOperations.mutateBody() (ADR-031), never
   * touch Vault/the Gate directly. An inline `@date` is written only when
   * the caller passes an explicit `dueDate` (the same bare-mention syntax
   * setDate() uses); without one the task has no due date — the page it is
   * created in, even a Daily Note, never implies one (ADR-044). Caller is
   * responsible for resolving `pageId` (e.g. via PageOperations.openAtPath
   * for a Daily Note) and for forcing durability afterward
   * (PageOperations.requestSave) if the result needs to be visible
   * immediately rather than on the next autosave — this method only
   * commits the new line, mirroring every other mutation here.
   */
  public async create(pageId: string, title: string, dueDate?: string): Promise<void> {
    const trimmed = title.trim();

    if (trimmed === '') {
      throw new Error('Task title must not be empty.');
    }

    try {
      await this.mutateTaskBody(pageId, (markdown) => {
        const line = `- [ ] ${trimmed}${dueDate ? ` @${dueDate}` : ''}`;
        return insertTaskBlock(markdown, line);
      });
    } catch (error) {
      if (error instanceof MutateBodyAbandonedError) {
        throw new Error(`Failed to create task "${trimmed}": ${error.reason}`);
      }

      throw error;
    }
  }

  /**
   * Removes a task's line from its source page entirely — the delete half
   * of this facade's mutation surface, mirroring mutate()/mutateDate()'s
   * own locateLine() resolution exactly, just splicing the line out
   * instead of rewriting it. No surrounding blank-line cleanup; only the
   * task's own line is touched.
   */
  public async delete(task: TaskOccurrence): Promise<void> {
    const source = this.requireSourcePosition(task);

    try {
      await this.mutateTaskBody(task.sourcePageId, (markdown) => {
        const lines = markdown.split('\n');
        const lineIndex = this.locateLine(markdown, lines, task, source);

        lines.splice(lineIndex, 1);

        return lines.join('\n');
      });
    } catch (error) {
      if (error instanceof MutateBodyAbandonedError) {
        throw new Error(`Failed to delete task "${task.text}": ${error.reason}`);
      }

      throw error;
    }
  }

  /**
   * Inserts an exact copy of a task's line immediately below the original
   * in its source page — same locateLine() resolution as delete(), just
   * splicing a copy in after the line instead of removing it. The copy is
   * verbatim (completion state and every inline token included); only the
   * task's own line is copied, never any nested lines beneath it.
   */
  public async duplicate(task: TaskOccurrence): Promise<void> {
    const source = this.requireSourcePosition(task);
    const rawText = source.rawText;

    try {
      await this.mutateTaskBody(task.sourcePageId, (markdown) => {
        const lines = markdown.split('\n');
        const lineIndex = this.locateLine(markdown, lines, task, source);

        lines.splice(lineIndex + 1, 0, rawText);

        return lines.join('\n');
      });
    } catch (error) {
      if (error instanceof MutateBodyAbandonedError) {
        throw new Error(`Failed to duplicate task "${task.text}": ${error.reason}`);
      }

      throw error;
    }
  }

  /**
   * The Edit Task modal's Save action: replaces the task's title text and,
   * only if `change.dueDate` genuinely differs from `task.dueDate`,
   * updates its inline date — same legacy-`@due:`-vs-bare-mention
   * preserve/replace/append/remove behavior `setDate()`/`clearDate()`
   * already give a direct date edit, reused here via `applyDatePatch`
   * rather than reimplemented.
   *
   * Always mutates `task.sourcePageId` in place via mutateBody() — never
   * resolves or opens a different page, so a due-date change here can
   * never move the task to a different Daily Note (or anywhere else),
   * regardless of what date is chosen. Moving a task between Daily Notes
   * is explicitly out of scope for this method; see Sidebar.Tasks.tsx's
   * own onSaveTask for why.
   *
   * The dueDate-unchanged guard matters specifically for a Daily Note task
   * with no explicit inline date: `task.dueDate` there is TaskBuilder's
   * implicit containing-Daily-Note fallback (TaskOccurrence.dueDate's own
   * doc comment), not real line content. Re-applying that same value
   * unconditionally would wrongly stamp a spurious explicit date onto a
   * line that never had one just because the user left the pre-filled
   * due-date field untouched while editing the title. Only an explicit,
   * different selection ever adds/changes/removes the inline date.
   */
  public async update(
    task: TaskOccurrence,
    change: { title: string; dueDate: string | undefined }
  ): Promise<void> {
    const trimmedTitle = change.title.trim();

    if (trimmedTitle === '') {
      throw new Error('Task title must not be empty.');
    }

    const source = this.requireSourcePosition(task);
    const rawText = source.rawText;
    const dueDateChanged = change.dueDate !== task.dueDate;

    try {
      await this.mutateTaskBody(task.sourcePageId, (markdown) => {
        const lines = markdown.split('\n');
        const lineIndex = this.locateLine(markdown, lines, task, source);

        const match = rawText.match(TASK_LINE_PATTERN);

        if (!match) {
          throw new Error(
            `Task source line no longer matches the expected format: "${rawText}"`
          );
        }

        const [, indent, marker, rest] = match;

        // Preserve the existing bare date mention verbatim only when the
        // date isn't changing — when it is, applyDatePatch below computes
        // the correct replacement/append/removal itself and must see a
        // rest with no stale bare date already baked in.
        let newRest = this.replaceTitle(rest ?? '', trimmedTitle, !dueDateChanged);

        if (dueDateChanged) {
          newRest = this.applyDatePatch(newRest, change.dueDate ?? null);
        }

        lines[lineIndex] = `${indent}- [${marker}] ${newRest}`;

        return lines.join('\n');
      });
    } catch (error) {
      if (error instanceof MutateBodyAbandonedError) {
        throw new Error(`Failed to update task "${task.text}": ${error.reason}`);
      }

      throw error;
    }
  }

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
   * Assigns/updates the task's date via the v1 bare `@YYYY-MM-DD` mention
   * syntax (TaskExtractor.BARE_DATE_PATTERN) — the syntax new tasks use;
   * `@due:` is legacy-only and never generated for new tasks (see
   * TaskExtractor's own doc comment on that precedence). Replaces an
   * existing bare-date mention in place, or a legacy `@due:` token in
   * place when the line already carries one (never both), or appends a
   * new bare mention at the end of the line when neither is present.
   */
  public async setDate(task: TaskOccurrence, date: string): Promise<void> {
    await this.mutateDate(task, date);
  }

  /** Removes the task's date, whichever syntax (`@due:` or bare mention) currently carries it. */
  public async clearDate(task: TaskOccurrence): Promise<void> {
    await this.mutateDate(task, null);
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
    const source = this.requireSourcePosition(task);
    const rawText = source.rawText;

    try {
      await this.mutateTaskBody(task.sourcePageId, (markdown) => {
        const lines = markdown.split('\n');
        const lineIndex = this.locateLine(markdown, lines, task, source);

        lines[lineIndex] = this.rewriteLine(rawText, change);

        return lines.join('\n');
      });
    } catch (error) {
      // mutateBody()'s own page-not-found/archived-page errors are already
      // in this class's historical wording (PageOperations mirrors them
      // verbatim) and propagate unchanged. Only a Gate abandonment — the
      // one failure mode with task-specific historical phrasing this class
      // must preserve — is caught and rewrapped here.
      if (error instanceof MutateBodyAbandonedError) {
        throw new Error(`Failed to update task "${task.text}": ${error.reason}`);
      }

      throw error;
    }
  }

  private async mutateDate(task: TaskOccurrence, date: string | null): Promise<void> {
    const source = this.requireSourcePosition(task);
    const rawText = source.rawText;

    try {
      await this.mutateTaskBody(task.sourcePageId, (markdown) => {
        const lines = markdown.split('\n');
        const lineIndex = this.locateLine(markdown, lines, task, source);

        lines[lineIndex] = this.rewriteDate(rawText, date);

        return lines.join('\n');
      });
    } catch (error) {
      if (error instanceof MutateBodyAbandonedError) {
        throw new Error(`Failed to update task "${task.text}": ${error.reason}`);
      }

      throw error;
    }
  }

  private requireSourcePosition(task: TaskOccurrence): TaskSourcePosition {
    const { rawText, startOffset, endOffset } = task;

    if (rawText == null || startOffset == null || endOffset == null) {
      throw new Error(
        `Task "${task.text}" has no recorded source position — cannot locate it for mutation.`
      );
    }

    return { rawText, startOffset, endOffset };
  }

  /**
   * Resolves the exact task occurrence `task` names to its line index in
   * `markdown` (whatever mutateBody() supplied — the open session's
   * current, possibly-dirty content, or the Vault's durable copy).
   * `lines` must be `markdown.split('\n')`.
   *
   * Positional first: the occurrence's own startOffset/endOffset, accepted
   * only when they still span one whole line whose text is exactly
   * `rawText`. This is what keeps two textually-identical task lines
   * distinct — rawText alone can't tell them apart.
   *
   * Offsets are relative to the page's last *durable* body, so an open
   * session with unsaved edits above the task legitimately shifts them.
   * Only then, and only when `rawText` appears on exactly one line, is
   * that line accepted — a unique match can't be the wrong occurrence.
   * Two or more identical lines with stale offsets is genuinely ambiguous,
   * and is refused rather than guessed (never "first match").
   *
   * Not business policy — a structural precondition, the same category as
   * MoveService's occupied-path check (ARCHITECTURE_RULES rule 5's
   * amendment): if the occurrence can't be resolved unambiguously, there
   * is nothing safe to rewrite.
   */
  private locateLine(
    markdown: string,
    lines: readonly string[],
    task: TaskOccurrence,
    { rawText, startOffset, endOffset }: TaskSourcePosition
  ): number {
    const spansWholeLine =
      startOffset >= 0 &&
      endOffset <= markdown.length &&
      (startOffset === 0 || markdown[startOffset - 1] === '\n') &&
      (endOffset === markdown.length || markdown[endOffset] === '\n');

    if (spansWholeLine && markdown.slice(startOffset, endOffset) === rawText) {
      return markdown.slice(0, startOffset).split('\n').length - 1;
    }

    const matches: number[] = [];
    lines.forEach((line, index) => {
      if (line === rawText) {
        matches.push(index);
      }
    });

    if (matches.length === 1) {
      return matches[0]!;
    }

    throw new Error(
      matches.length === 0
        ? `Could not locate task "${task.text}" in its source page — the page may have changed since this task was read.`
        : `Could not locate task "${task.text}" unambiguously in its source page — it has changed since this task was read and ${matches.length} identical lines now match.`
    );
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

  /**
   * update()'s own helper: replaces everything in `rest` that isn't
   * recognized metadata with `newTitle`. Recognized `@key:value` tokens
   * (`@due:`/`@completed:`) are always preserved verbatim, in whatever
   * form they're already written — this is what makes a legacy `@due:`
   * round-trip through a title edit untouched, same as applyDatePatch's
   * own legacy-preservation rule. A bare date mention (not a `@key:value`
   * token, so never caught by METADATA_TOKEN_PATTERN) is preserved
   * verbatim too, but only when `preserveBareDate` is true — update()
   * passes false when the date is also changing, since applyDatePatch
   * then needs to see a rest with no stale bare date already present to
   * compute the correct replacement.
   */
  private replaceTitle(rest: string, newTitle: string, preserveBareDate: boolean): string {
    const preserved: string[] = [];

    rest.replace(METADATA_TOKEN_PATTERN, (token) => {
      preserved.push(token);
      return '';
    });

    if (preserveBareDate && !/@due:\S+/.test(rest)) {
      const bareDateMatch = new RegExp(BARE_DATE_PATTERN.source).exec(rest);

      if (bareDateMatch) {
        preserved.push(`@${bareDateMatch[2]}`);
      }
    }

    return preserved.length > 0 ? `${newTitle} ${preserved.join(' ')}` : newTitle;
  }

  private rewriteDate(rawLine: string, date: string | null): string {
    const match = rawLine.match(TASK_LINE_PATTERN);

    if (!match) {
      throw new Error(
        `Task source line no longer matches the expected format: "${rawLine}"`
      );
    }

    const [, indent, marker, rest] = match;

    return `${indent}- [${marker}] ${this.applyDatePatch(rest ?? '', date)}`;
  }

  /**
   * A legacy `@due:` token already on the line wins (mirrors
   * TaskExtractor's own dueDate precedence) and is updated/removed in
   * place via the existing metadata patch, rather than left in place
   * alongside a second, competing bare-date mention. Otherwise, replaces
   * the first bare `@YYYY-MM-DD` mention in place, or appends a new one
   * at the end of the line when it has no date yet.
   */
  private applyDatePatch(rest: string, date: string | null): string {
    if (/@due:\S+/.test(rest)) {
      return this.applyMetadataPatch(rest, { due: date });
    }

    const bareDateMatch = new RegExp(BARE_DATE_PATTERN.source).exec(rest);

    if (bareDateMatch) {
      const boundary = bareDateMatch[1] ?? '';
      const matchStart = bareDateMatch.index;
      const matchEnd = matchStart + bareDateMatch[0].length;

      if (date == null) {
        return (rest.slice(0, matchStart) + rest.slice(matchEnd))
          .trim()
          .replace(/ {2,}/g, ' ');
      }

      return `${rest.slice(0, matchStart)}${boundary}@${date}${rest.slice(matchEnd)}`
        .trim()
        .replace(/ {2,}/g, ' ');
    }

    if (date == null) {
      return rest.trim().replace(/ {2,}/g, ' ');
    }

    return `${rest} @${date}`.trim().replace(/ {2,}/g, ' ');
  }
}

const LEGACY_INBOX_PLAN_PREFIX = '<!-- clutter-inbox-plan ';
interface LegacyInboxTransferPlan {
  readonly version: 1;
  readonly id: string;
  readonly body: string;
}
function readLegacyInboxPlan(markdown: string): LegacyInboxTransferPlan | undefined {
  if (!markdown.includes(LEGACY_INBOX_PLAN_PREFIX)) return undefined;
  const match = /(?:^|\n)<!-- clutter-inbox-plan ([^\n]+) -->$/.exec(markdown);
  if (!match)
    throw new Error(
      'The unfinished Tidy up record could not be read; Inbox was kept'
    );
  let plan: unknown;
  try {
    plan = JSON.parse(match[1]!);
  } catch {
    throw new Error(
      'The unfinished Tidy up record could not be read; Inbox was kept'
    );
  }
  if (
    !plan ||
    typeof plan !== 'object' ||
    !('version' in plan) ||
    plan.version !== 1 ||
    !('id' in plan) ||
    typeof plan.id !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(plan.id) ||
    !('body' in plan) ||
    typeof plan.body !== 'string'
  ) {
    throw new Error('Inbox changed since Tidy up started; its tasks were kept');
  }
  return plan as LegacyInboxTransferPlan;
}

/** The existing newest-task-first insertion policy, shared by creation and transfer. */
function insertTaskBlock(markdown: string, block: string): string {
  if (markdown === '') return block;
  const lines = markdown.split('\n');
  const firstTask = lines.findIndex((line) => TASK_LINE_PATTERN.test(line));
  if (firstTask < 0) return `${block}\n${markdown}`;
  lines.splice(firstTask, 0, block);
  return lines.join('\n');
}

function datedTasks(markdown: string) {
  return new TaskExtractor()
    .extract(markdown)
    .filter((task) => task.dueDate && isValidCalendarDate(task.dueDate));
}
function removeTaskLines(markdown: string): string {
  const offsets = new Set(datedTasks(markdown).map((task) => task.startOffset));
  let offset = 0;
  return markdown
    .split('\n')
    .filter((line) => {
      const keep = !offsets.has(offset);
      offset += line.length + 1;
      return keep;
    })
    .join('\n');
}
function legacyTransferId(markdown: string): string | undefined {
  const text = markdown.trimEnd();
  const plan = readLegacyInboxPlan(text);
  if (!plan) return undefined;
  const marker = text.lastIndexOf(LEGACY_INBOX_PLAN_PREFIX);
  const prefix = marker === 0 ? '' : text.slice(0, marker - 1);
  if (prefix === plan.body) return plan.id;
  const original = new Set(datedTasks(plan.body).map((task) => task.rawText));
  if (datedTasks(prefix).some((task) => original.has(task.rawText))) {
    throw new Error(
      'An earlier Tidy up checkpoint changed; Inbox tasks were kept for review'
    );
  }
  return undefined;
}
function destinationsSaved(record: TaskTransferRecord): boolean {
  const dates = new Set(datedTasks(record.before).map((task) => task.dueDate));
  return (
    dates.size > 0 &&
    record.destinations.length === dates.size &&
    new Set(record.destinations.map((d) => d.date)).size === dates.size &&
    record.destinations.every((d) => d.state === 'saved' && dates.has(d.date))
  );
}
function containsTaskLines(
  markdown: string,
  lines: readonly string[]
): boolean {
  const counts = new Map<string, number>();
  for (const task of new TaskExtractor().extract(markdown))
    counts.set(task.rawText, (counts.get(task.rawText) ?? 0) + 1);
  for (const line of lines) {
    const count = counts.get(line) ?? 0;
    if (!count) return false;
    counts.set(line, count - 1);
  }
  return true;
}
