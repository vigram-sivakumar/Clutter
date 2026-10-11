// A resolved relationship between two pages in the vault.
//
// GraphEdge is a runtime model owned by the KnowledgeGraph. It is derived
// from the output of LinkResolver, but it is intentionally independent of the
// resolver implementation.
export interface GraphEdge {
  // Page containing the reference.
  readonly sourcePageId: string;

  // Page the reference resolves to.
  readonly targetPageId: string;

  // Optional fragment within the target page.
  readonly heading?: string;
  readonly blockReference?: string;

  // Whether the edge originated from a normal link or an embed.
  readonly kind: 'link' | 'embed';

  // The reference's exact character range in the source page's markdown
  // (end exclusive), from the occurrence that produced the edge — what lets
  // a backlink be revealed in its source note.
  readonly startOffset?: number;
  readonly endOffset?: number;
}
