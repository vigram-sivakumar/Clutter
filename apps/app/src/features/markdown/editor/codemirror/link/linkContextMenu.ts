import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

import { resolveNavigationUrl } from '@shared/helpers/openExternalUrl';

import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';

export interface EditorLink {
  readonly from: number;
  readonly to: number;
  readonly url: string;
  readonly markdown: string;
}

/** Resolve the whole link, even when the pointer is over formatting inside its label or its raw URL. */
export function editorLinkAt(
  state: EditorState,
  pos: number
): EditorLink | null {
  // Active table cells are plain-text CM views without a language extension. Parse those with
  // Clutter’s existing shared grammar rather than changing how the cell editor renders or behaves.
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

    const raw = state.sliceDoc(url.from, url.to);
    let destination =
      raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
    // Markdown destinations may escape punctuation or encode entities. Decode only the destination;
    // Copy as Markdown retains the original source, including label formatting and optional title.
    if (link?.name === 'Link') {
      destination = destination.replace(
        /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,
        '$1'
      );
      destination = destination.replace(
        /&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][a-zA-Z\d]+);/g,
        (entity) => {
          const decoder = document.createElement('textarea');
          decoder.innerHTML = entity;
          return decoder.value;
        }
      );
    }
    if (
      link?.name === 'Autolink' &&
      !destination.includes(':') &&
      destination.includes('@')
    ) {
      destination = `mailto:${destination}`;
    }
    if (!destination) return null;
    const range = link ?? url;
    const navigationUrl = resolveNavigationUrl(destination);
    return {
      from: range.from,
      to: range.to,
      url: navigationUrl,
      markdown: link
        ? state.sliceDoc(link.from, link.to)
        : raw === navigationUrl
          ? `<${raw}>`
          : `[${raw.replace(/[\\[\]]/g, '\\$&')}](<${navigationUrl}>)`,
    };
  }
  return null;
}
