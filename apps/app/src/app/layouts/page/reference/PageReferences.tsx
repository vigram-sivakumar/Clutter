import { useMemo } from 'react';

import { Note } from '@features/notes/sidebar/Note';
import { DailyNote } from '@features/daily-notes/sidebar/DailyNote';
import { renderTaskRow } from '@features/tasks/helpers/renderTasksByDate';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { Vault } from '@core/vault/models/Vault';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import {
  getDailyNotePreviewLabel,
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
  toPageDisplayLabelInput,
} from '@core/presentation/getPageDisplayLabel';
import { isToday } from '@shared/helpers/time';

import { getPageReferences, type PageReference } from './getPageReferences';
import { References } from './Reference';

interface PageReferencesProps {
  /** The open page. Its inbound references are what this lists. */
  readonly pageId: string;
  readonly vault: Vault;
  readonly pageOperations: PageOperations;
  readonly taskOperations: TaskOperations;
  /** AppLayout's pending-reveal request — consumed by PageHost once the source note is open. */
  readonly onRequestReveal: (reveal: PendingEditorReveal) => void;
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
  readonly resolveEmbed?: ResolvePageEmbed;
}

/**
 * The References section for the open page: the knowledge graph's inbound references, as the app's own
 * Task / Note / DailyNote rows. Opening a row is `PageOperations.open()` plus a reveal request for the exact
 * range(s) that reference the open page — the same two calls the Tasks and Tags sidebars make.
 */
export function PageReferences({
  pageId,
  vault,
  pageOperations,
  taskOperations,
  onRequestReveal,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: PageReferencesProps) {
  // The graph is replaced on every Vault mutation and is otherwise the same object, so this recomputes
  // exactly when something that could change the references did.
  const graph = vault.knowledgeGraph();
  const references = useMemo(() => getPageReferences(vault, pageId), [vault, graph, pageId]);

  const openSource = (sourcePageId: string, ranges: PageReference['ranges']): void => {
    void pageOperations.open(sourcePageId);

    if (ranges.length > 0) {
      onRequestReveal({ pageId: sourcePageId, ranges });
    }
  };

  // A task is revealed at its own line, exactly as the Tasks sidebar does.
  const openTask = (task: TaskOccurrence): void => {
    openSource(
      task.sourcePageId,
      task.startOffset !== undefined && task.endOffset !== undefined
        ? [{ from: task.startOffset, to: task.endOffset }]
        : []
    );
  };

  const resolvers = { resolveWikiLink, resolveTag, resolveEmbed };

  return (
    <References
      tasks={
        references.tasks.length > 0
          ? references.tasks.map(({ task }) =>
              renderTaskRow(task, {
                onToggleComplete: (target) => void taskOperations.toggleComplete(target),
                onOpenTask: openTask,
                onChangeDueDate: (target, date) =>
                  void (date === null ? taskOperations.clearDate(target) : taskOperations.setDate(target, date)),
                onDuplicateTask: (target) => void taskOperations.duplicate(target),
                onDeleteTask: (target) => void taskOperations.delete(target),
                ...resolvers,
              })
            )
          : null
      }
      notes={
        references.notes.length > 0
          ? references.notes.map(({ page, ranges }) => {
              const label = getPageDisplayLabel(toPageDisplayLabelInput(page));

              return (
                <Note
                  key={page.id}
                  title={label.text}
                  titleStyle={getPageDisplayLabelStyle(label)}
                  emoji={page.metadata.icon}
                  onClick={() => openSource(page.id, ranges)}
                  {...resolvers}
                />
              );
            })
          : null
      }
      dailyNotes={
        references.dailyNotes.length > 0
          ? references.dailyNotes.map(({ page, ranges }) => {
              const label = getDailyNotePreviewLabel(toPageDisplayLabelInput(page));

              return (
                <DailyNote
                  key={page.id}
                  title={label.text}
                  titleStyle={getPageDisplayLabelStyle(label)}
                  date={page.name}
                  isToday={isToday(page.name)}
                  onClick={() => openSource(page.id, ranges)}
                  {...resolvers}
                />
              );
            })
          : null
      }
    />
  );
}
