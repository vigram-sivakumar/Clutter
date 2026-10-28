import type {
  AtomicVaultWriter,
  AtomicWriteOutcome,
  DurabilityGap,
  DurabilityResult,
  InspectionResult,
  InspectQuery,
  NotCommittedReason,
  WriteAttempt,
} from '../atomicWrite/AtomicWriteContract';
import type { InMemoryVaultFileSystem } from './InMemoryVaultFileSystem';

/** What the next write does instead of behaving normally (a test hook; consumed once, in order). */
export type InMemoryWriteFault =
  /** The write does not happen: `notCommitted` with this reason. */
  | { readonly kind: 'not-committed'; readonly reason: NotCommittedReason }
  /** The replacement's result is uncertain. `takesEffect` says whether the new content really was installed. */
  | { readonly kind: 'uncertain'; readonly takesEffect: boolean }
  /** The content is installed, but a flush did not confirm. */
  | { readonly kind: 'durability-unconfirmed'; readonly gaps?: readonly DurabilityGap[] };

/**
 * An `AtomicVaultWriter` over an `InMemoryVaultFileSystem`, for tests of everything built on the contract. It
 * enforces the **semantics** (the four intents, the outcomes, inspection, flush-only confirmation) and nothing about
 * durability or the operating system: `kind` says so, and a test that needs the real guarantees must use the native
 * writer. It does not touch the filesystem's own `writeFile` contract, which stays the plain write the production
 * provider also offers.
 */
export class InMemoryAtomicVaultWriter implements AtomicVaultWriter {
  readonly kind = 'in-memory-simulation' as const;

  private readonly faults: InMemoryWriteFault[] = [];
  private readonly durabilityFaults: (readonly DurabilityGap[])[] = [];
  /** Every call, in order, for assertions about what was attempted and how often. */
  readonly calls: string[] = [];
  /** Content left in a "temporary file" by an uncertain write that did not take effect, by path. */
  private readonly temps = new Map<string, string>();
  private tempCounter = 0;

  constructor(private readonly fileSystem: InMemoryVaultFileSystem) {}

  /** Queues a fault for an upcoming `write`. */
  inject(fault: InMemoryWriteFault): this {
    this.faults.push(fault);
    return this;
  }

  /** Makes the next `confirmDurability` answer `unconfirmed` with these gaps. */
  injectDurabilityFailure(gaps: readonly DurabilityGap[] = [{ kind: 'directorySyncFailed', detail: 'injected' }]): this {
    this.durabilityFaults.push(gaps);
    return this;
  }

  async write(attempt: WriteAttempt): Promise<AtomicWriteOutcome> {
    this.calls.push(`write:${attempt.intent.kind}:${attempt.path}`);
    const fault = this.faults.shift();
    const existing = (await this.fileSystem.exists(attempt.path)) ? await this.fileSystem.readFile(attempt.path) : null;

    const refused = this.refusal(attempt, existing);
    if (refused) return refused;

    if (fault?.kind === 'not-committed') {
      return { status: 'notCommitted', reason: fault.reason, detail: 'injected', leftovers: [] };
    }
    if (fault?.kind === 'uncertain') {
      if (fault.takesEffect) {
        await this.fileSystem.writeFile(attempt.path, attempt.contents);
        return { status: 'uncertain', detail: 'injected: took effect', recoveryPaths: [] };
      }
      const temp = `${attempt.path}.clutter-tmp.${this.tempCounter++}`;
      this.temps.set(temp, attempt.contents);
      return { status: 'uncertain', detail: 'injected: did not take effect', recoveryPaths: [temp] };
    }

    await this.fileSystem.writeFile(attempt.path, attempt.contents);

    return {
      status: 'committed',
      replaced: existing === null ? 'created' : 'existing',
      durability:
        fault?.kind === 'durability-unconfirmed'
          ? { status: 'unconfirmed', gaps: fault.gaps ?? [{ kind: 'directorySyncFailed', detail: 'injected' }] }
          : { status: 'confirmed' },
      confirmedByInspection: false,
      metadataNotes: [],
      leftovers: [],
    };
  }

  /** The intent checks every native write makes, in the same words. */
  private refusal(attempt: WriteAttempt, existing: string | null): AtomicWriteOutcome | null {
    const no = (reason: NotCommittedReason, detail: string): AtomicWriteOutcome => ({
      status: 'notCommitted',
      reason,
      detail,
      leftovers: [],
    });
    switch (attempt.intent.kind) {
      case 'create':
        return existing === null ? null : no('destinationExists', 'something already exists at the destination');
      case 'replace':
        return existing !== null ? null : no('targetMissing', 'there is no file at the destination');
      case 'replaceIfContent':
        return existing === attempt.intent.expected ? null : no('staleExpected', 'the target does not hold the expected content');
      case 'upsert':
        return null;
    }
  }

  async inspect(query: InspectQuery): Promise<InspectionResult> {
    this.calls.push(`inspect:${query.path}`);
    const exists = await this.fileSystem.exists(query.path);
    const content = exists ? await this.fileSystem.readFile(query.path) : null;
    const target =
      content === null
        ? 'missing'
        : content === query.attempted
          ? 'holdsAttempted'
          : content === query.previous
            ? 'holdsPrevious'
            : 'holdsOther';

    return {
      status: 'inspected',
      target,
      temps: query.tempPaths.map((path) => {
        const held = this.temps.get(path);
        return held === undefined
          ? { path, state: 'absent' as const }
          : { path, state: held === query.attempted ? ('holdsAttempted' as const) : ('holdsOther' as const) };
      }),
    };
  }

  async confirmDurability(path: string, expected: string): Promise<DurabilityResult> {
    this.calls.push(`confirm:${path}`);
    if (!(await this.fileSystem.exists(path))) return { status: 'missing' };
    if ((await this.fileSystem.readFile(path)) !== expected) return { status: 'superseded' };
    const gaps = this.durabilityFaults.shift();

    return gaps ? { status: 'unconfirmed', gaps } : { status: 'confirmed' };
  }
}
