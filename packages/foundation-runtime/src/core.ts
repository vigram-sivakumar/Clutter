import { Fault, parseCommand, toBase64, fromBase64 } from './contracts.ts';
import type {
  Command,
  PageSnapshot,
  Receipt,
  Reply,
  EditorCheckout,
  ProtectedDraft,
} from './contracts.ts';
import type { PageEngine, Principal, Vault, Stored } from './ports.ts';
export type ContextOptions = { newGrant: () => string };
type ContextGrant = { pageId: string; peerId: string; grant: string };
/** Sole semantic page facade. Context commands are another ingress, not another owner. */
class PageOperations {
  private readonly vault: Vault;
  private readonly engine: PageEngine;
  private readonly options?: ContextOptions;
  private readonly contexts = new Map<string, ContextGrant>();
  private readonly epoch?: string;
  constructor(vault: Vault, engine: PageEngine, options?: ContextOptions) {
    this.vault = vault;
    this.engine = engine;
    this.options = options;
    this.epoch = options?.newGrant();
  }
  private page(id: string): Stored {
    const p = this.vault.load(id);
    if (!p) throw new Fault('NOT_FOUND');
    return p;
  }
  private granted(
    c: { pageId: string; contextId: string; grant: string },
    peerId: string
  ): void {
    const grant = this.contexts.get(c.contextId);
    if (
      !grant ||
      grant.pageId !== c.pageId ||
      grant.peerId !== peerId ||
      grant.grant !== c.grant
    )
      throw new Fault('CONTEXT_GRANT_REQUIRED');
  }
  async execute(
    c: Command,
    peerId: string
  ): Promise<PageSnapshot | Receipt | EditorCheckout | ProtectedDraft> {
    if (c.method === 'page.read') {
      const p = this.vault.load(c.pageId, c.atSequence);
      if (!p) throw new Fault('NOT_FOUND');
      return {
        ...this.engine.project(p),
        pageId: p.pageId,
        kind: p.kind,
        head: p.head,
        sequence: p.sequence,
      };
    }
    if (c.method === 'editor.open') {
      if (!this.options || !this.engine.applyUpdate)
        throw new Fault('EDITOR_UNAVAILABLE');
      const p = this.page(c.pageId),
        old = this.contexts.get(c.contextId);
      if (old && (old.pageId !== c.pageId || old.peerId !== peerId))
        throw new Fault('CONTEXT_ALREADY_BOUND');
      const grant = old ?? {
        pageId: c.pageId,
        peerId,
        grant: this.options.newGrant(),
      };
      this.contexts.set(c.contextId, grant);
      return {
        pageId: p.pageId,
        kind: p.kind,
        head: p.head,
        sequence: p.sequence,
        contextId: c.contextId,
        grant: grant.grant,
        epoch: this.epoch!,
        payload: toBase64(p.bytes),
        generationFloor:
          this.vault.recovery(c.pageId, c.contextId, peerId)?.generation ?? 0,
      };
    }
    if (c.method === 'editor.recovery') {
      const saved = this.vault.recovery(c.pageId, c.contextId, peerId);
      if (!saved) throw new Fault('NOT_FOUND');
      return {
        pageId: c.pageId,
        kind: saved.root.kind,
        head: saved.root.head,
        sequence: saved.root.sequence,
        contextId: c.contextId,
        generation: saved.generation,
        baseHead: saved.baseHead,
        payload: toBase64(saved.root.bytes),
        ...(saved.pending ? { pending: saved.pending } : {}),
      };
    }
    // Scope/peer identity is checked before this; exact durable replay survives grant epochs.
    const actorId = c.method.startsWith('editor.') ? peerId : undefined;
    const prior = this.vault.outcome(c, actorId);
    if (prior) return prior;
    if (c.method === 'page.create') {
      if (this.vault.load(c.pageId)) throw new Fault('ALREADY_EXISTS');
      return this.vault.commit(c, [
        { root: this.engine.create(c.pageId, c.kind, c), expectedHead: null },
      ]);
    }
    const previous = this.page(c.pageId);
    if (c.method === 'editor.apply' || c.method === 'editor.protect') {
      this.granted(c, peerId);
      const base = this.vault.findRoot(c.pageId, c.baseHead);
      if (!base) throw new Fault('UNKNOWN_BASE');
      if (!this.engine.applyUpdate) throw new Fault('EDITOR_UNAVAILABLE');
      const update = fromBase64(c.update);
      if (c.method === 'editor.apply') {
        const root = this.engine.applyUpdate(previous, base, update);
        return this.vault.commit(c, [{ root, expectedHead: previous.head }], {
          actorId,
        });
      }
      if (
        c.pending &&
        (c.pending.pageId !== c.pageId ||
          c.pending.contextId !== c.contextId ||
          c.pending.spaceId !== c.spaceId ||
          c.pending.generation > c.generation)
      )
        throw new Fault('INVALID_PENDING_REQUEST');
      const root = this.engine.applyUpdate(base, base, update);
      if (c.pending) {
        const pendingBase = this.vault.findRoot(c.pageId, c.pending.baseHead);
        if (!pendingBase) throw new Fault('UNKNOWN_BASE');
        const withPending = this.engine.applyUpdate(
          root,
          pendingBase,
          fromBase64(c.pending.update)
        );
        if (withPending.head !== root.head)
          throw new Fault('PENDING_NOT_PROTECTED');
      }
      return this.vault.commit(c, [], {
        actorId,
        protection: {
          contextId: c.contextId,
          generation: c.generation,
          baseHead: c.baseHead,
          root,
          ...(c.pending ? { pending: c.pending } : {}),
        },
      });
    }
    if (previous.head !== c.expectedHead) throw new Fault('CONFLICT');
    if (Object.keys(c.patch).length === 0) throw new Fault('EMPTY_PATCH');
    return this.vault.commit(c, [
      {
        root: this.engine.update(previous, {
          ...this.engine.project(previous),
          ...c.patch,
        }),
        expectedHead: c.expectedHead,
      },
    ]);
  }
}
const boundVaults = new WeakSet<Vault>();
/** One running Core instance composes the facade and Vault. */
export class SpaceService {
  readonly spaceId: string;
  private readonly operations: PageOperations;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<
    (hint: { pageIds: string[]; sequence: number }) => void
  >();
  constructor(vault: Vault, engine: PageEngine, options?: ContextOptions) {
    if (boundVaults.has(vault)) throw new Fault('SERVICE_ALREADY_BOUND');
    boundVaults.add(vault);
    this.spaceId = vault.spaceId;
    this.operations = new PageOperations(vault, engine, options);
  }
  subscribe(
    listener: (hint: { pageIds: string[]; sequence: number }) => void
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  execute(value: unknown, principal: Principal): Promise<Reply> {
    let c: Command, peerId: string;
    try {
      c = parseCommand(value);
      peerId = principal.peerId ?? '';
      const read = c.method === 'page.read' || c.method === 'editor.recovery';
      if (
        c.spaceId !== this.spaceId ||
        principal.spaceId !== this.spaceId ||
        !principal.scopes.includes('read') ||
        (!read && !principal.scopes.includes('write')) ||
        (c.method.startsWith('editor.') &&
          !/^[a-zA-Z0-9_-]{1,128}$/.test(peerId))
      )
        throw new Fault('FORBIDDEN');
    } catch (e) {
      return Promise.resolve({
        ok: false,
        error: { code: e instanceof Fault ? e.code : 'INVALID_REQUEST' },
      });
    }
    const run = async (): Promise<Reply> => {
      try {
        const value = await this.operations.execute(c, peerId);
        if ('changedHeads' in value && Object.keys(value.changedHeads).length)
          for (const listener of this.listeners) {
            try {
              listener({
                pageIds: Object.keys(value.changedHeads),
                sequence: value.sequence,
              });
            } catch {}
          }
        return { ok: true, value };
      } catch (e) {
        return {
          ok: false,
          error: {
            code: e instanceof Fault ? e.code : 'INTERNAL_ERROR',
            ...('operationId' in c ? { operationId: c.operationId } : {}),
          },
        };
      }
    };
    const result = this.tail.then(run, run);
    this.tail = result;
    return result;
  }
}
