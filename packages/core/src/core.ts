import { admitImport, validateAssociations } from './media-policy.mjs';
import {
  Fault,
  parseCommand,
  toBase64,
  fromBase64,
  stable,
  parseAssetLinks,
} from './contracts.ts';
import type {
  Command,
  PageSnapshot,
  PageList,
  Receipt,
  Reply,
  EditorCheckout,
  ProtectedDraft,
  MediaSnapshot,
  MediaFile,
  AssetLinks,
  AssetMeta,
} from './contracts.ts';
import type {
  PageEngine,
  Principal,
  SpaceStore,
  Stored,
  Root,
  RootChange,
} from './ports.ts';
export type ContextOptions = { newGrant: () => string };
type ContextGrant = { pageId: string; peerId: string; grant: string };
/** Sole semantic page facade. Context commands are another ingress, not another owner. */
class PageOperations {
  private readonly vault: SpaceStore;
  private readonly engine: PageEngine;
  private readonly options?: ContextOptions;
  private readonly contexts = new Map<string, ContextGrant>();
  private readonly epoch?: string;
  constructor(vault: SpaceStore, engine: PageEngine, options?: ContextOptions) {
    this.vault = vault;
    this.engine = engine;
    this.options = options;
    this.epoch = options?.newGrant();
    vault.auditRoots((root, index) => {
      const links = this.links(root);
      if (stable(links) !== stable(index))
        throw new Fault('BROKEN_ASSET_INDEX');
      this.validateLinks(root, links);
    });
  }
  private links(root: Root): AssetLinks {
    return parseAssetLinks(this.engine.assetLinks?.(root) ?? {});
  }
  private validateLinks(
    root: Root,
    links: AssetLinks,
    objects: Record<string, AssetMeta> = {}
  ): void {
    const assets = Object.fromEntries(
      Object.values(links).map((link) => [
        link.hash,
        objects[link.hash] ?? this.vault.assetMeta(link.hash),
      ])
    );
    try {
      validateAssociations({
        notes: root.kind === 'note' ? { [root.pageId]: {} } : {},
        tasks: root.kind === 'task' ? { [root.pageId]: {} } : {},
        assets,
        assetLinks: Object.fromEntries(
          Object.entries(links).map(([id, link]) => [
            id,
            { pageId: root.pageId, ...link },
          ])
        ),
      });
    } catch (e) {
      throw new Fault((e as Error).message);
    }
  }
  private change(
    root: Root,
    expectedHead: string | null,
    objects: Record<string, AssetMeta> = {}
  ): RootChange {
    const links = this.links(root);
    this.validateLinks(root, links, objects);
    return { root, expectedHead, links };
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
  ): Promise<
    | PageSnapshot
    | PageList
    | Receipt
    | EditorCheckout
    | ProtectedDraft
    | MediaSnapshot
    | MediaFile
  > {
    if (c.method === 'page.list') {
      const limit = c.limit ?? 50;
      const roots = this.vault.list(c.afterId ?? '', limit + 1);
      const pages = roots.slice(0, limit).map((p) => ({
        pageId: p.pageId,
        kind: p.kind,
        head: p.head,
        sequence: p.sequence,
        title: this.engine.project(p).title,
      }));
      return {
        pages,
        ...(roots.length > limit ? { next: pages.at(-1)!.pageId } : {}),
      };
    }
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
    if (c.method === 'media.list' || c.method === 'media.read') {
      const root = this.vault.load(c.pageId, c.atSequence);
      if (!root) throw new Fault('NOT_FOUND');
      const links = this.links(root);
      this.validateLinks(root, links);
      if (c.method === 'media.list')
        return {
          pageId: c.pageId,
          head: root.head,
          sequence: root.sequence,
          assets: Object.fromEntries(
            Object.entries(links).map(([id, link]) => [
              id,
              { ...link, ...this.vault.assetMeta(link.hash) },
            ])
          ),
        };
      const link = Object.hasOwn(links, c.attachmentId)
        ? links[c.attachmentId]
        : undefined;
      if (!link) throw new Fault('ATTACHMENT_NOT_FOUND');
      return {
        pageId: c.pageId,
        head: root.head,
        sequence: root.sequence,
        attachmentId: c.attachmentId,
        ...link,
        ...this.vault.assetMeta(link.hash),
        payload: toBase64(this.vault.readAsset(link.hash)),
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
        this.change(this.engine.create(c.pageId, c.kind, c), null),
      ]);
    }
    const previous = this.page(c.pageId);
    if (
      c.method === 'media.import' ||
      c.method === 'media.replace' ||
      c.method === 'media.remove'
    ) {
      if (previous.head !== c.expectedHead) throw new Fault('CONFLICT');
      if (!this.engine.withAssetLinks) throw new Fault('MEDIA_UNAVAILABLE');
      const links = this.links(previous);
      this.validateLinks(previous, links);
      const existing = Object.hasOwn(links, c.attachmentId)
        ? links[c.attachmentId]
        : undefined;
      if (c.method === 'media.remove') {
        if (!existing) throw new Fault('ATTACHMENT_NOT_FOUND');
        delete links[c.attachmentId];
        const root = this.engine.withAssetLinks(previous, links);
        return this.vault.commit(c, [this.change(root, previous.head)]);
      }
      if (c.method === 'media.import') {
        try {
          admitImport(c, {
            hasPage: () => true,
            hasAttachment: (id) => !!this.vault.currentAttachment(id),
            pageLinks: Object.values(links),
          });
        } catch (e) {
          throw new Fault((e as Error).message);
        }
        if (Object.keys(links).length >= 100)
          throw new Fault('MEDIA_COUNT_LIMIT');
      } else if (!existing) throw new Fault('ATTACHMENT_NOT_FOUND');
      const role = c.method === 'media.import' ? c.role : existing!.role;
      if (role === 'cover' && c.mime !== 'image/png')
        throw new Fault('INVALID_COVER');
      const published = await this.vault.publishAsset(c, fromBase64(c.payload)),
        objects = { [published.hash]: published.meta };
      links[c.attachmentId] = { hash: published.hash, name: c.name, role };
      const root = this.engine.withAssetLinks(previous, links);
      return this.vault.commit(c, [this.change(root, previous.head, objects)], {
        objects,
      });
    }
    if (c.method === 'editor.apply' || c.method === 'editor.protect') {
      this.granted(c, peerId);
      const base = this.vault.findRoot(c.pageId, c.baseHead);
      if (!base) throw new Fault('UNKNOWN_BASE');
      if (!this.engine.applyUpdate) throw new Fault('EDITOR_UNAVAILABLE');
      const update = fromBase64(c.update);
      if (c.method === 'editor.apply') {
        const root = this.engine.applyUpdate(previous, base, update);
        return this.vault.commit(c, [this.change(root, previous.head)], {
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
          links: this.change(root, base.head).links,
          ...(c.pending ? { pending: c.pending } : {}),
        },
      });
    }
    if (previous.head !== c.expectedHead) throw new Fault('CONFLICT');
    if (Object.keys(c.patch).length === 0) throw new Fault('EMPTY_PATCH');
    return this.vault.commit(c, [
      this.change(
        this.engine.update(previous, {
          ...this.engine.project(previous),
          ...c.patch,
        }),
        c.expectedHead
      ),
    ]);
  }
}
const boundVaults = new WeakSet<SpaceStore>();
/** One running Core instance composes the facade and SpaceStore. */
export class SpaceService {
  readonly spaceId: string;
  private readonly operations: PageOperations;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<
    (hint: { pageIds: string[]; sequence: number }) => void
  >();
  constructor(vault: SpaceStore, engine: PageEngine, options?: ContextOptions) {
    if (boundVaults.has(vault)) throw new Fault('SERVICE_ALREADY_BOUND');
    this.spaceId = vault.spaceId;
    this.operations = new PageOperations(vault, engine, options);
    boundVaults.add(vault);
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
      const read =
        c.method === 'page.list' ||
        c.method === 'page.read' ||
        c.method === 'editor.recovery' ||
        c.method === 'media.list' ||
        c.method === 'media.read';
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
