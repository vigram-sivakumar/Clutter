/**
 * Tracks filesystem paths this app is in the middle of writing itself, so a
 * later filesystem-watcher event for the same path can be recognized as an
 * echo of our own write rather than a genuine external edit.
 *
 * Paths are counted, not just flagged, so two overlapping internal writes to
 * the same path (e.g. a fast edit-save followed immediately by an archive)
 * each get their own echo suppressed instead of the second one leaking
 * through and being misread as an external change.
 */
export class SelfWriteRegistry {
  private readonly pendingCounts = new Map<string, number>();
  private readonly pendingMoveCounts = new Map<string, number>();

  public markPending(path: string): void {
    this.pendingCounts.set(path, (this.pendingCounts.get(path) ?? 0) + 1);
  }

  /**
   * Consumes one pending write for `path`, if any are recorded. Returns true
   * when the caller should treat the corresponding filesystem event as our
   * own echo rather than an external change.
   */
  public consumePending(path: string): boolean {
    const count = this.pendingCounts.get(path);

    if (!count) {
      return false;
    }

    if (count === 1) {
      this.pendingCounts.delete(path);
    } else {
      this.pendingCounts.set(path, count - 1);
    }

    return true;
  }

  public markPendingMove(fromPath: string, toPath: string): void {
    const key = this.moveKey(fromPath, toPath);
    this.pendingMoveCounts.set(key, (this.pendingMoveCounts.get(key) ?? 0) + 1);
  }

  /**
   * Consumes one pending move for the exact `(fromPath, toPath)` pair, if any
   * are recorded. Both paths must match — destination-only matching would
   * swallow unrelated external moves to the same target path.
   */
  public consumePendingMove(fromPath: string, toPath: string): boolean {
    const key = this.moveKey(fromPath, toPath);
    const count = this.pendingMoveCounts.get(key);

    if (!count) {
      return false;
    }

    if (count === 1) {
      this.pendingMoveCounts.delete(key);
    } else {
      this.pendingMoveCounts.set(key, count - 1);
    }

    return true;
  }

  private moveKey(fromPath: string, toPath: string): string {
    return `${fromPath}\0${toPath}`;
  }
}
