import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { resolveNavigationUrl } from '@shared/helpers/openExternalUrl';

import { decodeLinkDestination } from '../../../render/inlineSpan';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';

export interface EditorLink {
  readonly from: number;
  readonly to: number;
  readonly url: string;
  readonly markdown: string;
}

/** Canonical menu payload for an exact parsed occurrence, in either a live
 * editor or a static cell. Coordinates remain in the occurrence's source. */
export function editorLinkFromNode(
  node: SyntaxNode,
  slice: (from: number, to: number) => string
): EditorLink | null {
  const link = node.name === 'Link' || node.name === 'Autolink' ? node : null;
  const url = link ? link.getChild('URL') : node.name === 'URL' ? node : null;
  if (!url) return null;
  const raw = slice(url.from, url.to);
  const destination = decodeLinkDestination(raw, link?.name);
  if (!destination) return null;
  const navigationUrl = resolveNavigationUrl(destination);
  return {
    from: node.from,
    to: node.to,
    url: navigationUrl,
    markdown: link
      ? slice(link.from, link.to)
      : raw === navigationUrl
        ? `<${raw}>`
        : `[${raw.replace(/[\\[\]]/g, '\\/** Resolve the whole link, even when the pointer is over formatting inside its label or its raw URL. */')}](<${navigationUrl}>)`,
  };
}

/** Resolve the whole link, even when the pointer is over formatting inside its label or its raw URL. */
export function editorLinkAt(
  state: EditorState,
  pos: number
): EditorLink | null {
  // Prose and active cells install the Markdown language extension. Retain
  // the shared-parser fallback for callers without a populated syntax tree.
  const currentTree = syntaxTree(state);
  const tree = currentTree.length
    ? currentTree
    : sharedMarkdownParser.parse(state.doc.toString());
  for (const side of [1, -1] as const) {
    let link: SyntaxNode | null = null;
    let url: SyntaxNode | null = null;
    for (
      let node: SyntaxNode | null = tree.resolveInner(pos, side);
      node;
      node = node.parent
    ) {
      // An image’s source URL is editable source, not a navigable link.
      if (node.name === 'Image') return null;
      if (node.name === 'URL') url = node;
      if (node.name === 'Link' || node.name === 'Autolink') link = node;
    }
    if (link) url = link.getChild('URL');
    if (!url) continue;

    return editorLinkFromNode(link ?? url, (from, to) => state.sliceDoc(from, to));
  }
  return null;
}
