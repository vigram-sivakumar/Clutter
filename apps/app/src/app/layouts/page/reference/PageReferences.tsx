import { useMemo, useRef, useState } from 'react';

import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import type {
  ResolveTag,
  ResolveWikiLink,
} from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import type { PendingEditorReveal } from '@app/layouts/page/PendingEditorReveal';
import { resolvePageIdentityIcon } from '@app/layouts/page/resolvePageIdentityIcon';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { Page } from '@core/vault/models/Page';
import type { Vault } from '@core/vault/models/Vault';
import {
  getPageDisplayLabel,
  toPageDisplayLabelInput,
} from '@core/presentation/getPageDisplayLabel';

import { containsEmbed } from './extractReferenceLine';
import { getPageReferences, type PageReference } from './getPageReferences';
import { References, ReferenceEntry } from './Reference';
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
export function PageReferences({
  pageId,
  vault,
  pageOperations,
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
  const [isExpanded, setIsExpanded] = useState(true);

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

  // The source page's own icon, emoji and display title — what an entry's Wiki header shows.
  const identity = (page: Page) => {
    const { icon, emoji } = resolvePageIdentityIcon(page, undefined);

    return {
      icon,
      emoji: emoji ?? undefined,
      title: getPageDisplayLabel(toPageDisplayLabelInput(page)).text,
    };
  };

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
      {...identity(page)}
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
                  onCheckedChange={() =>
                    void taskOperations.toggleComplete(task)
                  }
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
          : null
      }
      notes={noteEntries.length > 0 ? noteEntries.map(pageEntry) : null}
    />
  );
}
