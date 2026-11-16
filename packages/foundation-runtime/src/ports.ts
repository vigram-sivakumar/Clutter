import type { PageContent, PageKind, Receipt, Mutation } from './contracts.ts';
export type Root = {
  pageId: string;
  kind: PageKind;
  head: string;
  bytes: Uint8Array;
};
export type Stored = Root & { sequence: number };
/** Engine owns codec/schema interpretation, not persistence. */
export interface PageEngine {
  create(pageId: string, kind: PageKind, content: PageContent): Root;
  update(previous: Root, content: PageContent): Root;
  project(root: Root): PageContent;
}
/** Vault implements atomic storage and guards; it contains no page/task workflow. */
export type RootChange = { root: Root; expectedHead: string | null };
export interface Vault {
  readonly spaceId: string;
  load(pageId: string, atSequence?: number): Stored | undefined;
  outcome(command: Mutation): Receipt | undefined;
  commit(command: Mutation, changes: readonly RootChange[]): Promise<Receipt>;
}
export type Principal = {
  spaceId: string;
  scopes: readonly ('read' | 'write')[];
};
