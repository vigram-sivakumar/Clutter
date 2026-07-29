/**
 * Identifies the exclusive lane a sync operation runs in.
 *
 * A `page` key anchors to durable page identity (survives rename/move). A
 * `path` key is a fallback for filesystem locations that don't resolve to a
 * known page yet (a brand-new file, or the destination half of a rename
 * before it lands).
 */
export type SyncKey =
  | {
      readonly type: 'page';
      readonly id: string;
    }
  | {
      readonly type: 'path';
      readonly path: string;
    };

/**
 * Guarantees that operations sharing the same SyncKey execute sequentially,
 * in the order they were submitted, and never overlap. Operations under
 * different keys run independently and may overlap freely.
 *
 * This class knows nothing about Vault, Page, Markdown, filesystem events,
 * DocumentSession, or the UI — it is a generic per-key exclusion primitive.
 * VaultSyncService owns translating filesystem events into SyncKeys and
 * operations; this class only owns the ordering guarantee.
 */
export class VaultSyncCoordinator {
  private readonly queues = new Map<string, Promise<unknown>>();

  /**
   * Runs `operation` exclusively with respect to every other operation
   * previously submitted under the same key.
   *
   * A rejected operation does not prevent subsequently queued operations
   * (for the same key or otherwise) from running — the failure is isolated
   * to the caller's own returned promise. Once an operation settles and no
   * newer operation has been queued behind it, its key's queue entry is
   * removed so the map never grows unbounded.
   */
  public runExclusive<T>(key: SyncKey, operation: () => Promise<T>): Promise<T> {
    const normalizedKey = this.normalize(key);
    const previous = this.queues.get(normalizedKey) ?? Promise.resolve();

    const next = previous.catch(() => undefined).then(operation);

    this.queues.set(normalizedKey, next);

    return next.finally(() => {
      if (this.queues.get(normalizedKey) === next) {
        this.queues.delete(normalizedKey);
      }
    });
  }

  /**
   * Number of keys with a currently in-flight (not yet settled) operation.
   * Exposed only so tests can observe that completed queues are actually
   * cleaned up rather than accumulating.
   */
  public get pendingKeyCount(): number {
    return this.queues.size;
  }

  /**
   * Encodes a SyncKey as a string that cannot collide across key types: the
   * type tag is always the leading segment, so a `path` value can never be
   * crafted to alias a `page` key or vice versa.
   */
  private normalize(key: SyncKey): string {
    switch (key.type) {
      case 'page':
        return `page:${key.id}`;
      case 'path':
        return `path:${key.path}`;
    }
  }
}
