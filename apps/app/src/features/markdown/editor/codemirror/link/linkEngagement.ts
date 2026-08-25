import type { TokenNodeRange } from '../semanticToken/tokenEngagement';

export type LinkNodeRange = TokenNodeRange;

/** The one Link-specific fact the generic semantic-token mechanisms need: which Lezer node names count as an (explicit) Markdown Link. */
export const isLinkNode = (nodeName: string): boolean => nodeName === 'Link';
