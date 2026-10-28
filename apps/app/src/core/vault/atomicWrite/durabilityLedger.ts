import { fingerprint } from '../../recovery/fingerprint';

/**
 * Which saved revisions are installed on disk but not yet confirmed durable (ADR-063, decision 13), and when a
 * recovery record may therefore be released. Pure state; nothing here touches a file or a journal.
 *
 * Entries are **save attempts**, each with its own identity, not "the content" and not "the page". Content alone is
 * not an identity: A -> B -> A writes the same bytes twice, and the answer for the first A (confirmed, superseded, or
 * its cleanup) says nothing about the second. So:
 *
 * - `confirmed(attempt)` / `superseded(attempt)` retire that attempt only. A newer attempt with identical bytes keeps
 *   its own entry and its own protection.
 * - A newer revision being visible on disk is **not** a durability confirmation for that revision.
 * - A recovery record protects the content it holds. It may be removed only when the note has nothing unsaved **and**
 *   no pending attempt still holds that record's content (any attempt: if one of them is unconfirmed, the bytes
 *   might not survive a power loss, so the record stays).
 */
export interface PendingDurability {
  /** Unique per `add`, even for identical content on the same page. Results are applied to this and nothing else. */
  readonly attemptId: number;
  readonly pageId: string;
  readonly revision: number;
  /** `fingerprint(content)` of the saved revision. */
  readonly contentFingerprint: string;
}

export class DurabilityLedger {
  private readonly pending = new Map<number, PendingDurability>();
  private nextAttemptId = 1;

  /** A revision was committed with unconfirmed durability. Returns the attempt, whose id its result must carry. */
  public add(pageId: string, revision: number, content: string): PendingDurability {
    const entry = { attemptId: this.nextAttemptId++, pageId, revision, contentFingerprint: fingerprint(content) };
    this.pending.set(entry.attemptId, entry);

    return entry;
  }

  /** Does any unconfirmed attempt on this page hold exactly this content? */
  public isPending(pageId: string, content: string): boolean {
    const contentFingerprint = fingerprint(content);

    return [...this.pending.values()].some((entry) => entry.pageId === pageId && entry.contentFingerprint === contentFingerprint);
  }

  public pendingFor(pageId: string): readonly PendingDurability[] {
    return [...this.pending.values()].filter((entry) => entry.pageId === pageId);
  }

  /** `confirmDurability` answered `confirmed` for this attempt: it, and only it, is durable. */
  public confirmed(attemptId: number): void {
    this.pending.delete(attemptId);
  }

  /**
   * `confirmDurability` answered `superseded` for this attempt: the file holds something else. This attempt is
   * retired; no other attempt, even one with identical content, is touched or implied.
   */
  public superseded(attemptId: number): void {
    this.pending.delete(attemptId);
  }

  /** The page was closed or its vault discarded: nothing is pending for it any more. */
  public clearPage(pageId: string): void {
    for (const [attemptId, entry] of this.pending) {
      if (entry.pageId === pageId) this.pending.delete(attemptId);
    }
  }
}

/**
 * May this page's recovery record be removed now? `recordContent` is what the record holds (the journal's own record
 * for the page, ADR-062). The old rule — "nothing unsaved" — stays necessary; it is no longer sufficient.
 */
export function mayRemoveRecoveryRecord(input: {
  readonly ledger: DurabilityLedger;
  readonly pageId: string;
  readonly noUnsavedChanges: boolean;
  readonly recordContent: string;
}): boolean {
  return input.noUnsavedChanges && !input.ledger.isPending(input.pageId, input.recordContent);
}
