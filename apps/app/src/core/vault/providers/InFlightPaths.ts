/**
 * The filesystem paths an application-managed operation (an archive in the Persistence Gate) is in the middle of
 * changing — from the moment it starts to move a file until the Vault has been told. Shared by the Gate, which
 * registers them, and VaultSyncService, which must not act on watcher events for these paths while they are in flight.
 *
 * Why it exists: the Gate renames a file and only afterwards commits the Vault, and the watcher's report of that
 * rename can arrive in between — or be paired with some other file's rename (macOS gives no correlation id). Read
 * against a Vault that still has the old path, such an event looks like an external delete or move and removes or
 * relocates a page the Gate is still working on. Sync therefore WAITS for these paths to settle and then
 * reconciles from what is on disk and in the Vault; it never drops the event. The Gate never waits on Sync, so
 * the two cannot deadlock.
 *
 * A registered path covers itself and everything under it (an archived folder's subtree). Comparison ignores
 * case, as the filesystem the app runs on does.
 */
export class InFlightPaths {
  private readonly active = new Map<symbol, readonly string[]>();
  private readonly waiters = new Set<() => void>();

  /** Marks `paths` in flight; the returned release (idempotent) ends it and wakes anything waiting. */
  public begin(paths: readonly string[]): () => void {
    const token = Symbol('in-flight');
    this.active.set(token, paths.map(normalize));

    return () => {
      if (this.active.delete(token)) {
        for (const wake of [...this.waiters]) {
          wake();
        }
      }
    };
  }

  /** Whether `path` is one an in-flight operation is changing, or lies inside one. */
  public covers(path: string): boolean {
    const target = normalize(path);

    for (const entries of this.active.values()) {
      if (entries.some((entry) => target === entry || target.startsWith(`${entry}/`))) {
        return true;
      }
    }

    return false;
  }

  /** Resolves once none of `paths` is covered — immediately when none is. Re-checks on every release. */
  public async whenSettled(paths: readonly string[]): Promise<void> {
    while (paths.some((path) => this.covers(path))) {
      await new Promise<void>((resolve) => {
        const wake = () => {
          this.waiters.delete(wake);
          resolve();
        };
        this.waiters.add(wake);
      });
    }
  }
}

function normalize(path: string): string {
  return path.replace(/\/+$/, '').toLowerCase();
}
