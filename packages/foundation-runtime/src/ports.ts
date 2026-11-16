import type {
  PageContent,
  PageKind,
  Receipt,
  Mutation,
  EditorApply,
} from './contracts.ts';
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
  applyUpdate?(latest: Root, base: Root, update: Uint8Array): Root;
}
/** Vault implements atomic storage and guards; it contains no page/task workflow. */
export type RootChange = { root: Root; expectedHead: string | null };
export type ProtectionPlan = {
  contextId: string;
  generation: number;
  baseHead: string;
  root: Root;
  pending?: EditorApply;
};
export type CommitOptions = { actorId?: string; protection?: ProtectionPlan };
export type RecoveryRoot = {
  root: Stored;
  contextId: string;
  generation: number;
  baseHead: string;
  pending?: EditorApply;
};
export interface Vault {
  readonly spaceId: string;
  load(pageId: string, atSequence?: number): Stored | undefined;
  findRoot(pageId: string, head: string): Stored | undefined;
  recovery(
    pageId: string,
    contextId: string,
    actorId: string
  ): RecoveryRoot | undefined;
  outcome(command: Mutation, actorId?: string): Receipt | undefined;
  commit(
    command: Mutation,
    changes: readonly RootChange[],
    options?: CommitOptions
  ): Promise<Receipt>;
}
export type Principal = {
  spaceId: string;
  peerId?: string;
  scopes: readonly ('read' | 'write')[];
};
