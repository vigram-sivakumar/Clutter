import type { AtomicVaultWriter } from './AtomicWriteContract';
import { DurabilityLedger } from './durabilityLedger';

/** The existing save-retry cadence (2, 4, 8, 16, 30 s), reused for the flush-only confirmation. */
export const DURABILITY_CONFIRM_DELAYS_MS: readonly number[] = [2_000, 4_000, 8_000, 16_000, 30_000];

export interface DurabilityTrackerOptions {
  readonly delaysMs?: readonly number[];
  /** Called whenever a path gains or loses pending durability, so recovery can re-evaluate that note. */
  readonly onChange?: (path: string) => void;
}

/**
 * Follows revisions that were installed on disk with flush gaps ("saved, not yet confirmed durable") and asks the
 * native layer to flush them again without rewriting anything (ADR-063, decision 13). While a revision of a path is
 * pending, the recovery record that protects the path is kept even though the note is clean (`hasPending`).
 *
 * It never rewrites a file and never retries a save: `confirmDurability` only flushes, and only while the file still
 * holds exactly the revision asked about, so confirming N can never stand in for N+1.
 */
export class DurabilityTracker {
  private readonly ledger = new DurabilityLedger();
  private readonly delays: readonly number[];
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly contents = new Map<number, { path: string; content: string; failures: number }>();
  private disposed = false;

  constructor(
    private readonly writer: AtomicVaultWriter,
    private readonly options: DurabilityTrackerOptions = {}
  ) {
    this.delays = options.delaysMs ?? DURABILITY_CONFIRM_DELAYS_MS;
  }

  /** A revision was committed with unconfirmed durability. */
  register(path: string, content: string): void {
    if (this.disposed) return;
    const attempt = this.ledger.add(path, 0, content);
    this.contents.set(attempt.attemptId, { path, content, failures: 0 });
    this.options.onChange?.(path);
    this.schedule(attempt.attemptId);
  }

  /** Whether any revision of this path is installed but not confirmed durable. */
  hasPending(path: string): boolean {
    return this.ledger.pendingFor(path).length > 0;
  }

  pendingPaths(): string[] {
    return [...new Set([...this.contents.values()].map((entry) => entry.path))];
  }

  /**
   * One bounded confirmation attempt for everything still pending, without waiting for the backoff. What shutdown
   * does before leaving the records as they are.
   */
  async settleOnce(): Promise<void> {
    await Promise.all([...this.contents.keys()].map((attemptId) => this.confirm(attemptId, false)));
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private schedule(attemptId: number): void {
    const entry = this.contents.get(attemptId);
    if (!entry || this.disposed) return;
    const delay = this.delays[entry.failures];
    // Out of budget: the entry (and the recovery record it protects) simply stays.
    if (delay === undefined) return;
    this.timers.set(
      attemptId,
      setTimeout(() => {
        this.timers.delete(attemptId);
        void this.confirm(attemptId, true);
      }, delay)
    );
  }

  private async confirm(attemptId: number, reschedule: boolean): Promise<void> {
    const entry = this.contents.get(attemptId);
    if (!entry) return;
    const timer = this.timers.get(attemptId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(attemptId);
    }

    let settled = false;
    try {
      const result = await this.writer.confirmDurability(entry.path, entry.content);
      if (result.status === 'confirmed') {
        this.ledger.confirmed(attemptId);
        settled = true;
      } else if (result.status === 'superseded' || result.status === 'missing') {
        // The file now holds something else (or nothing): this revision's entry is retired and no other entry, nor
        // any other revision's durability, is implied.
        this.ledger.superseded(attemptId);
        settled = true;
      }
    } catch {
      // The native layer could not be asked: the same as an unconfirmed answer.
    }

    if (settled) {
      this.contents.delete(attemptId);
      this.options.onChange?.(entry.path);
      return;
    }
    entry.failures += 1;
    if (reschedule) this.schedule(attemptId);
  }
}
