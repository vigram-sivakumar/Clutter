import type { ReactNode } from 'react';

import { AppIcon } from '@shared/icon';
import { renderCompactMarkdown, type CompactMarkdownResolvers } from '@features/markdown/render/renderCompactMarkdown';
import { CollectionSourceLink } from '../entry/CollectionSourceLink';
import { TAG_CONTEXT_ICON } from '@features/tags/sidebar/TagContextEntry';

import type { CollectionEntryModel } from '../../page/CollectionEntryModel';

/** What a note's Name cell shows in place of its filename inside a Tag collection (none elsewhere). */
export interface NoteTagContent {
  /** The matching-content icon, in place of the note icon. */
  readonly leading: ReactNode;
  /** The matching line, rendered as compact Markdown. */
  readonly titleContent: ReactNode;
  /**
   * The Source property's value, drawn exactly as the Task Collection draws its Source (`CollectionSourceLink`): the
   * source note's icon and label as a link that opens it. Absent when the entry has no Source.
   */
  readonly source: ReactNode | undefined;
}

/**
 * Whether a note entry draws its description as the snippet beneath its title (when the Description property is on).
 * A note does. A matching-content entry in a Tag collection does not: it stands for one LINE of a note — that line is
 * its title — so the note's description would sit under it as if it described the line. (A Tag collection lists only
 * notes and their lines; it has no folders or files, and a folder's or file's own list item never draws a description.)
 */
export function showsDescriptionSnippet(entry: CollectionEntryModel, visible: readonly string[]): boolean {
  return visible.includes('description') && entry.tagLine === undefined;
}

/**
 * A Tag collection matching-content entry's Name cell: the one Markdown line it stands for (`getTagLineContexts`, the
 * same lines the Tags sidebar lists as separate rows) with the sidebar's content icon (`TAG_CONTEXT_ICON`), rendered
 * through the same `renderCompactMarkdown`. An entry that is the note itself (frontmatter-only membership, a draft —
 * the sidebar's note entry) has no line, so it keeps its own name and icon. Outside a Tag collection this returns nothing.
 */
export function toNoteTagContent(
  entry: CollectionEntryModel,
  resolvers: CompactMarkdownResolvers | undefined
): NoteTagContent | undefined {
  const line = entry.tagLine;

  if (line === undefined) {
    return undefined;
  }

  return {
    leading: <AppIcon icon={TAG_CONTEXT_ICON} />,
    titleContent: renderCompactMarkdown(line, resolvers),
    source: entry.values.source !== undefined && (
      <CollectionSourceLink
        label={entry.values.source}
        icon={entry.icon}
        emoji={entry.emoji}
        onOpen={entry.onClick}
      />
    ),
  };
}
