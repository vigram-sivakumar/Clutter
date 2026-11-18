import { Fault } from './contracts.ts';
import type { CoreClient } from './client.ts';
import type {
  EditorCheckout,
  EditorApply,
  EditorProtect,
  ProtectedDraft,
  Receipt,
  Reply,
} from './contracts.ts';
export interface EditorViewHandle {
  destroy(): void;
  focus(): void;
}
export type HistoryOptions = { preserveSelection?: boolean };
/** Renderer/CRDT port. Selection lives in each handle; history lives in the replica. */
export interface EditorReplica {
  delta(base: EditorCheckout): string;
  applyRemote(
    checkout: Pick<EditorCheckout, 'pageId' | 'kind' | 'head' | 'payload'>,
    options?: { ownSave?: boolean }
  ): void;
  mount(target: unknown): EditorViewHandle;
  history(
    view: EditorViewHandle,
    direction: 'undo' | 'redo',
    options?: HistoryOptions
  ): boolean;
  captureSelection(view: EditorViewHandle): unknown;
  restoreSelection(view: EditorViewHandle, bookmark: unknown): boolean;
  stopCapturing(): void;
  clearHistory(): void;
  destroy(): void;
}
export type EditorSessionOptions = {
  client: CoreClient;
  spaceId: string;
  pageId: string;
  contextId: string;
  nextId: () => string;
  createReplica: (
    checkout: EditorCheckout,
    onLocal: () => void
  ) => EditorReplica;
};
/** Context lifetime is independent of tabs/views; one path to Core, no local save fallback. */
export class EditorSession {
  private readonly options: EditorSessionOptions;
  private readonly replica: EditorReplica;
  private base: EditorCheckout;
  private generation = 0;
  private saved = 0;
  private protectedGeneration = -1;
  private pending?: { command: EditorApply; generation: number };
  private pendingProtection?: { command: EditorProtect; generation: number };
  private tail: Promise<unknown> = Promise.resolve();
  private readonly unsubscribe: () => void;
  private disposed = false;
  private tasks = 0;
  lastError: string | null = null;
  historyBoundary: string | null = null;
  private constructor(options: EditorSessionOptions, base: EditorCheckout) {
    this.options = options;
    this.base = base;
    this.generation = this.saved = base.generationFloor;
    this.replica = options.createReplica(base, () => {
      this.generation++;
    });
    this.unsubscribe = options.client.subscribe((hint) => {
      if (hint.pageIds.includes(options.pageId))
        void this.sync().catch((e) => {
          this.lastError = e instanceof Error ? e.message : 'SYNC_FAILED';
        });
    });
  }
  static async open(options: EditorSessionOptions): Promise<EditorSession> {
    const r = await options.client.execute({
      apiVersion: 1,
      method: 'editor.open',
      spaceId: options.spaceId,
      pageId: options.pageId,
      contextId: options.contextId,
    });
    if (!r.ok) throw new Fault(r.error.code);
    return new EditorSession(options, r.value);
  }
  private queued<T>(run: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Fault('CONTEXT_DISPOSED'));
    this.tasks++;
    const result = this.tail.then(run, run).finally(() => {
      this.tasks--;
    });
    this.tail = result;
    return result;
  }
  get dirty(): boolean {
    return this.generation !== this.saved;
  }
  get canClose(): boolean {
    return (
      this.tasks === 0 &&
      (!this.dirty || this.protectedGeneration === this.generation)
    );
  }
  get pendingCommand(): EditorApply | undefined {
    return this.pending ? structuredClone(this.pending.command) : undefined;
  }
  mount(target: unknown): EditorViewHandle {
    if (this.disposed) throw new Fault('CONTEXT_DISPOSED');
    return this.replica.mount(target);
  }
  history(
    view: EditorViewHandle,
    direction: 'undo' | 'redo',
    options?: HistoryOptions
  ): boolean {
    return this.replica.history(view, direction, options);
  }
  /** Opaque view-local bookmark; accepted document state still lives in Core. */
  captureSelection(view: EditorViewHandle): unknown {
    return this.replica.captureSelection(view);
  }
  restoreSelection(view: EditorViewHandle, bookmark: unknown): boolean {
    return this.replica.restoreSelection(view, bookmark);
  }
  stopCapturing(): void {
    this.replica.stopCapturing();
  }
  private async reconcile(savedHead?: string): Promise<Reply<EditorCheckout>> {
    const r = await this.options.client.execute({
      apiVersion: 1,
      method: 'editor.open',
      spaceId: this.options.spaceId,
      pageId: this.options.pageId,
      contextId: this.options.contextId,
    });
    if (!r.ok) {
      this.lastError = r.error.code;
      return r;
    }
    if (r.value.sequence < this.base.sequence)
      throw new Fault('DURABLE_SEQUENCE_REGRESSION');
    if (r.value.epoch !== this.base.epoch) {
      this.replica.clearHistory();
      this.historyBoundary = 'SERVICE_RESTART';
    }
    this.replica.applyRemote(r.value, { ownSave: r.value.head === savedHead });
    this.base = r.value;
    return r;
  }
  async settle(): Promise<void> {
    for (;;) {
      const tail = this.tail;
      await tail;
      if (tail === this.tail) return;
    }
  }
  sync(): Promise<Reply<EditorCheckout>> {
    return this.queued(() => this.reconcile());
  }
  private async saveOnce(): Promise<Reply<Receipt>> {
    if (!this.dirty && !this.pending) throw new Fault('NO_CHANGES');
    if (!this.pending)
      this.pending = {
        generation: this.generation,
        command: {
          apiVersion: 1,
          method: 'editor.apply',
          spaceId: this.options.spaceId,
          pageId: this.options.pageId,
          contextId: this.options.contextId,
          operationId: this.options.nextId(),
          grant: this.base.grant,
          baseHead: this.base.head,
          update: this.replica.delta(this.base),
          generation: this.generation,
        },
      };
    let pending = this.pending;
    let r = await this.options.client.execute(pending.command);
    if (!r.ok && r.error.code === 'CONTEXT_GRANT_REQUIRED') {
      // An authoritative refusal means no stored outcome for the old operation.
      // Reopen and create a NEW identity; never change an unknown request in place.
      const opened = await this.reconcile();
      if (!opened.ok) return opened;
      pending = {
        generation: pending.generation,
        command: {
          ...pending.command,
          grant: this.base.grant,
          operationId: this.options.nextId(),
        },
      };
      this.pending = pending;
      r = await this.options.client.execute(pending.command);
    }
    if (!r.ok) {
      this.lastError = r.error.code;
      return r;
    }
    const opened = await this.reconcile(r.value.head);
    if (!opened.ok || opened.value.sequence < r.value.sequence) {
      this.lastError = 'OUTCOME_UNKNOWN';
      return {
        ok: false,
        error: {
          code: 'OUTCOME_UNKNOWN',
          operationId: pending.command.operationId,
        },
      };
    }
    this.saved = pending.generation;
    this.pending = undefined;
    this.lastError = null;
    return r;
  }
  save(): Promise<Reply<Receipt>> {
    return this.queued(() => this.saveOnce());
  }
  async flush(): Promise<Reply<Receipt> | undefined> {
    let result: Reply<Receipt> | undefined;
    while (this.dirty || this.pending) {
      result = await this.save();
      if (!result.ok) return result;
    }
    return result;
  }
  protect(): Promise<Reply<Receipt>> {
    return this.queued(async () => {
      if (!this.dirty) throw new Fault('NO_CHANGES');
      if (!this.pendingProtection)
        this.pendingProtection = {
          generation: this.generation,
          command: {
            apiVersion: 1,
            method: 'editor.protect',
            spaceId: this.options.spaceId,
            pageId: this.options.pageId,
            contextId: this.options.contextId,
            operationId: this.options.nextId(),
            grant: this.base.grant,
            baseHead: this.base.head,
            update: this.replica.delta(this.base),
            generation: this.generation,
            ...(this.pending ? { pending: this.pending.command } : {}),
          },
        };
      let p = this.pendingProtection;
      let r = await this.options.client.execute(p.command);
      if (!r.ok && r.error.code === 'CONTEXT_GRANT_REQUIRED') {
        const opened = await this.reconcile();
        if (!opened.ok) return opened;
        p = {
          generation: p.generation,
          command: {
            ...p.command,
            grant: this.base.grant,
            operationId: this.options.nextId(),
          },
        };
        this.pendingProtection = p;
        r = await this.options.client.execute(p.command);
      }
      if (!r.ok) {
        this.lastError = r.error.code;
        return r;
      }
      if (!r.value.protection || r.value.protection.generation !== p.generation)
        throw new Fault('INVALID_PROTECTION_ACK');
      this.protectedGeneration = p.generation;
      this.pendingProtection = undefined;
      this.lastError = null;
      return r;
    });
  }
  recover(): Promise<Reply<ProtectedDraft>> {
    return this.queued(async () => {
      if (this.dirty || this.pending)
        throw new Fault('RECOVERY_REQUIRES_CLEAN_CONTEXT');
      const r = await this.options.client.execute({
        apiVersion: 1,
        method: 'editor.recovery',
        spaceId: this.options.spaceId,
        pageId: this.options.pageId,
        contextId: this.options.contextId,
      });
      if (!r.ok) return r;
      if (
        this.base.head !== r.value.baseHead &&
        this.base.head !== r.value.head
      )
        throw new Fault('RECOVERY_CONFLICT');
      this.replica.applyRemote(r.value);
      this.replica.clearHistory();
      this.historyBoundary = 'PROTECTED_RECOVERY';
      this.generation = r.value.generation;
      this.saved = 0;
      this.protectedGeneration = this.generation;
      this.pending = r.value.pending
        ? { command: r.value.pending, generation: r.value.pending.generation }
        : undefined;
      return r;
    });
  }
  async prepareClose(): Promise<boolean> {
    try {
      await this.flush();
      if (this.dirty) await this.protect();
      await this.settle();
      return this.canClose;
    } catch {
      return false;
    }
  }
  destroy(): void {
    if (this.tasks) throw new Fault('CONTEXT_BUSY');
    if (!this.canClose) throw new Fault('UNPROTECTED_CHANGES');
    this.unsubscribe();
    this.replica.destroy();
    this.disposed = true;
  }
}
