import { catalogue, Fault } from './contracts.ts';

export type EditingContextScope = Readonly<{
  spaceId: string;
  pageId: string;
  contextId: string;
}>;
export interface RetainedEditingContext {
  prepareClose(): Promise<boolean>;
  destroy(): void;
}
export interface EditingContextLease<T extends RetainedEditingContext> {
  readonly session: T;
  release(): void;
}
type Entry<T extends RetainedEditingContext> = {
  opening: Promise<T>;
  borrowers: number;
  closing?: Promise<boolean>;
};
function normalized(scope: EditingContextScope): EditingContextScope {
  // Identity validation belongs to the existing command catalogue, not this adapter.
  const value = catalogue['editor.open'].parse({
    apiVersion: 1,
    method: 'editor.open',
    spaceId: scope.spaceId,
    pageId: scope.pageId,
    contextId: scope.contextId,
  });
  return Object.freeze({
    spaceId: value.spaceId,
    pageId: value.pageId,
    contextId: value.contextId,
  });
}
const keyFor = (scope: EditingContextScope): string =>
  JSON.stringify([scope.spaceId, scope.pageId, scope.contextId]);

/** UI-composition lifetime adapter. Owns leases only; accepted state/save policy stay in Core/session. */
export class EditingContextRegistry<T extends RetainedEditingContext> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly open: (scope: EditingContextScope) => Promise<T>;
  constructor(open: (scope: EditingContextScope) => Promise<T>) {
    this.open = open;
  }
  async acquire(input: EditingContextScope): Promise<EditingContextLease<T>> {
    const scope = normalized(input),
      key = keyFor(scope);
    let entry = this.entries.get(key);
    if (entry?.closing) throw new Fault('CONTEXT_CLOSING');
    if (!entry) {
      entry = {
        opening: Promise.resolve().then(() => this.open(scope)),
        borrowers: 0,
      };
      this.entries.set(key, entry);
    }
    const retained = entry;
    retained.borrowers++;
    let session: T;
    try {
      session = await retained.opening;
    } catch (error) {
      retained.borrowers--;
      if (this.entries.get(key) === retained) this.entries.delete(key);
      throw error;
    }
    let released = false;
    return Object.freeze({
      session,
      release: () => {
        if (released) return;
        released = true;
        retained.borrowers--;
        // Closing a view never closes its context, writes content or drops history.
      },
    });
  }
  async close(input: EditingContextScope): Promise<boolean> {
    const key = keyFor(normalized(input)),
      entry = this.entries.get(key);
    if (!entry) return true;
    if (entry.borrowers) throw new Fault('CONTEXT_IN_USE');
    if (entry.closing) return entry.closing;
    // Install the closing barrier synchronously; a concurrent acquire cannot create a second session.
    const closing = Promise.resolve().then(async () => {
      const session = await entry.opening;
      if (!(await session.prepareClose())) return false;
      session.destroy();
      if (this.entries.get(key) === entry) this.entries.delete(key);
      return true;
    });
    entry.closing = closing;
    try {
      return await closing;
    } finally {
      if (entry.closing === closing) entry.closing = undefined;
    }
  }
}
