import { useMemo, useState } from 'react';

import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';
import { resolvePageIdentityIcon } from '@app/layouts/page/resolvePageIdentityIcon';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { Page } from '@core/vault/models/Page';
import type { Vault } from '@core/vault/models/Vault';
import { getPageDisplayLabel, toPageDisplayLabelInput } from '@core/presentation/getPageDisplayLabel';

import { getPageReferences, type PageReference } from './getPageReferences';
import { References, ReferenceEntry } from './Reference';

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
 * The References section for the open page: the knowledge graph's inbound references as two lists — tasks,
 * and notes with daily notes after them. Opening an entry is `PageOperations.open()` plus a reveal request for
 * the exact range(s) that reference the open page — the same two calls the Tasks and Tags sidebars make.
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
  const [isExpanded, setIsExpanded] = useState(true);

  // The graph is replaced on every Vault mutation and is otherwise the same object, so this recomputes
  // exactly when something that could change the references did.
  const graph = vault.knowledgeGraph();
  const references = useMemo(() => getPageReferences(vault, pageId), [vault, graph, pageId]);

  const resolvers = { resolveWikiLink, resolveTag, resolveEmbed };

  const openSource = (sourcePageId: string, ranges: PageReference['ranges']): void => {
    void pageOperations.open(sourcePageId);

    if (ranges.length > 0) {
      onRequestReveal({ pageId: sourcePageId, ranges });
    }
  };

  // The source page's own icon, emoji and display title — what an entry's Wiki header shows.
  const identity = (page: Page) => {
    const { icon, emoji } = resolvePageIdentityIcon(page, undefined);

    return {
      icon,
      emoji: emoji ?? undefined,
      title: getPageDisplayLabel(toPageDisplayLabelInput(page)).text,
    };
  };

  const pageEntry = ({ page, ranges, excerpt }: PageReference) => (
    <ReferenceEntry key={page.id} {...identity(page)} onOpen={() => openSource(page.id, ranges)}>
      {renderCompactMarkdown(excerpt, resolvers)}
    </ReferenceEntry>
  );

  // Regular notes, then daily notes — each already in its own order, never interleaved.
  const noteEntries = [...references.notes, ...references.dailyNotes];

  return (
    <References
      isExpanded={isExpanded}
      onExpandToggle={() => setIsExpanded((expanded) => !expanded)}
      tasks={
        references.tasks.length > 0
          ? references.tasks.map(({ task, page }) => {
              // A task is revealed at its own line, exactly as the Tasks sidebar does.
              const ranges =
                task.startOffset !== undefined && task.endOffset !== undefined
                  ? [{ from: task.startOffset, to: task.endOffset }]
                  : [];

              return (
                <ReferenceEntry
                  // Positional, so two textually-identical task lines never share a key.
                  key={`${task.sourcePageId}:${task.startOffset ?? task.text}`}
                  {...identity(page)}
                  isChecked={task.completed}
                  onCheckedChange={() => void taskOperations.toggleComplete(task)}
                  onOpen={() => openSource(task.sourcePageId, ranges)}
                >
                  {renderCompactMarkdown(task.text, resolvers)}
                </ReferenceEntry>
              );
            })
          : null
      }
      notes={noteEntries.length > 0 ? noteEntries.map(pageEntry) : null}
    />
  );
}
