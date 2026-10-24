import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';

import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type {
  ResolveTag,
  ResolveWikiLink,
} from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { Page } from '@core/vault/models/Page';
import type { Vault } from '@core/vault/models/Vault';
import type { ReferencesDisplayStore } from '@core/application/references/ReferencesDisplayStore';
import { useReferencesDisplayStore } from '@app/hooks/useReferencesDisplayStore';
import { useToast } from '@components/toast/ToastProvider';
import { createTaskActions } from '@features/tasks/helpers/createTaskActions';
import { useShowReferencesAutomatically } from '@shared/helpers/showReferencesAutomaticallyPreference';

import { containsEmbed } from './extractReferenceLine';
import { getSourceNoteHeadings } from './sourceNoteHeadings';
import { getPageReferences, type PageReference } from './getPageReferences';
import { countPageReferences, isReferencesDisplayed } from './referencesDisplay';
import { References, ReferenceEntry, ReferenceGroup } from './Reference';
import {
  createReferencePreviewExtensions,
  ReferencePreview,
  type ReferencePreviewContext,
} from './ReferencePreview';

interface PageReferencesProps {
  /** The open page. Its inbound references are what this lists. */
  readonly pageId: string;
  readonly vault: Vault;
  readonly pageOperations: PageOperations;
  /** The note's saved Hide/Show and expanded/collapsed choices (ADR-052). */
  readonly displayStore: ReferencesDisplayStore;
  readonly taskOperations: TaskOperations;
  /** AppLayout's pending-reveal request — consumed by PageHost once the source note is open. */
  readonly onRequestReveal: (reveal: PendingEditorReveal) => void;
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
  readonly resolveEmbed?: ResolvePageEmbed;
  /** The rest of what the editor's own rendering resolves through, so a preview draws images, PDFs and dates like the note does. */
  readonly resolveDate?: ReferencePreviewContext['resolveDate'];
  readonly resolveEmbedImage?: ReferencePreviewContext['resolveEmbedImage'];
  readonly resolveEmbedPdf?: ReferencePreviewContext['resolveEmbedPdf'];
  readonly resolveImageSrc?: ReferencePreviewContext['resolveImageSrc'];
}

/**
 * The References section for the open page: the knowledge graph's inbound references as two lists — tasks,
 * and notes with daily notes after them. Opening an entry is `PageOperations.open()` plus a reveal request for
 * the exact range(s) that reference the open page — the same two calls the Tasks and Tags sidebars make.
 */
/**
 * Groups already-ordered references by their source page's id — one group per page, at the position of its first
 * reference, each page's references staying in their existing order.
 */
function groupByPage<T>(
  items: readonly T[],
  pageOf: (item: T) => Page
): { page: Page; items: T[] }[] {
  const groups = new Map<string, { page: Page; items: T[] }>();

  for (const item of items) {
    const page = pageOf(item);
    const existing = groups.get(page.id);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(page.id, { page, items: [item] });
    }
  }

  return [...groups.values()];
}

export function PageReferences({
  pageId,
  vault,
  pageOperations,
  displayStore,
  taskOperations,
  onRequestReveal,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  resolveDate,
  resolveEmbedImage,
  resolveEmbedPdf,
  resolveImageSrc,
}: PageReferencesProps) {
  useReferencesDisplayStore(displayStore);
  const taskActions = createTaskActions(taskOperations, useToast());
  const savedHidden = displayStore.getHidden(pageId);
  const showAutomatically = useShowReferencesAutomatically();
  const isExpanded = !displayStore.isCollapsed(pageId);

  // The previews' resolvers are read at use time through this ref, so the one shared extension list below
  // (built once for this section, never per entry) always sees the current ones without being rebuilt.
  const previewContext = useRef<ReferencePreviewContext>({});
  previewContext.current = {
    resolveWikiLink,
    resolveTag,
    resolveDate,
    resolveEmbedImage,
    resolveEmbedPdf,
    resolveImageSrc,
    resolvePageEmbed: resolveEmbed,
  };
  const [previewExtensions] = useState(() =>
    createReferencePreviewExtensions(() => previewContext.current)
  );

  // The graph is replaced on every Vault mutation and is otherwise the same object, so this recomputes
  // exactly when something that could change the references did.
  const graph = vault.knowledgeGraph();
  const references = useMemo(
    () => getPageReferences(vault, pageId),
    [vault, graph, pageId]
  );

  // A line holding a note embed is shown compactly, with the embed drawn as a wiki link (never its content).
  const resolvers = {
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
    embedAsWikiLink: true,
  };

  const openSource = (
    sourcePageId: string,
    ranges: PageReference['ranges']
  ): void => {
    void pageOperations.open(sourcePageId);

    if (ranges.length > 0) {
      onRequestReveal({ pageId: sourcePageId, ranges });
    }
  };

  // A source page, once: its heading opens the page, and each of its references below opens its own place in it.
  const group = (page: Page, entries: ReactNode[]) => (
    <ReferenceGroup
      key={page.id}
      title={headings.get(page.id) ?? page.name}
      onOpen={() => openSource(page.id, [])}
    >
      {entries}
    </ReferenceGroup>
  );

  // The referencing line, in a read-only editor view. When it should not be shown that way (it holds an embed, or
  // is very long) the entry shows the line through the compact renderer instead.
  const pageEntry = ({
    page,
    lineFrom,
    ranges,
    line,
    excerpt,
  }: PageReference) => (
    <ReferenceEntry
      key={`${page.id}:${lineFrom}`}
      preview={
        line === null ? undefined : (
          <ReferencePreview markdown={line} extensions={previewExtensions} />
        )
      }
      onOpen={() => openSource(page.id, ranges)}
    >
      {renderCompactMarkdown(excerpt, resolvers)}
    </ReferenceEntry>
  );

  // Regular notes, then daily notes — each already in its own order, never interleaved.
  const noteEntries = [...references.notes, ...references.dailyNotes];

  // Every reference occurrence, as listed: tasks plus note and daily-note lines.
  const count = countPageReferences(references);

  // The source notes in this section — one heading each. A title is shown alone unless another source note has
  // the same one, in which case the folder tells them apart.
  const headings = getSourceNoteHeadings(
    [
      ...references.tasks.map(({ page }) => page),
      ...noteEntries.map(({ page }) => page),
    ],
    vault.root
  );

  // The note's saved choice wins; with none, shown automatically when the setting is on and there are references. The
  // saved expansion is untouched either way.
  if (!isReferencesDisplayed(savedHidden, { enabled: showAutomatically, count })) {
    return null;
  }

  return (
    <References
      count={count}
      showWhenEmpty
      isExpanded={isExpanded}
      onExpandToggle={() => displayStore.setCollapsed(pageId, isExpanded)}
      tasks={
        references.tasks.length > 0
          ? groupByPage(references.tasks, ({ page }) => page).map(
              ({ page, items }) =>
                group(
                  page,
                  items.map(({ task }) => {
                    // A task is revealed at its own line, exactly as the Tasks sidebar does.
                    const ranges =
                      task.startOffset !== undefined &&
                      task.endOffset !== undefined
                        ? [{ from: task.startOffset, to: task.endOffset }]
                        : [];

                    return (
                      <ReferenceEntry
                        // Positional, so two textually-identical task lines never share a key.
                        key={`${task.sourcePageId}:${task.startOffset ?? task.text}`}
                        isChecked={task.completed}
                        onCheckedChange={() => taskActions.toggleComplete(task)}
                        // The task's text (the checkbox is the entry's own control), with completed styling when done —
                        // compact, like a note line, when it holds an embed (an embed's content is never rendered here).
                        preview={
                          containsEmbed(task.text) ? undefined : (
                            <ReferencePreview
                              markdown={task.text}
                              extensions={previewExtensions}
                              isCompleted={task.completed}
                            />
                          )
                        }
                        onOpen={() => openSource(task.sourcePageId, ranges)}
                      >
                        {renderCompactMarkdown(task.text, resolvers)}
                      </ReferenceEntry>
                    );
                  })
                )
            )
          : null
      }
      notes={
        noteEntries.length > 0
          ? groupByPage(noteEntries, ({ page }) => page).map(
              ({ page, items }) => group(page, items.map(pageEntry))
            )
          : null
      }
    />
  );
}
