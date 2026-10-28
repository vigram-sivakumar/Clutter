import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '../testing/InMemoryVaultFileSystem';
import { InMemoryAtomicVaultWriter } from '../testing/InMemoryAtomicVaultWriter';
import { writeIntent, type InspectionResult, type WriteAttempt } from './AtomicWriteContract';
import { DurabilityLedger, mayRemoveRecoveryRecord } from './durabilityLedger';
import { decideAfterUncertain, mayRetryWithoutInspecting } from './uncertainWritePolicy';

const inspected = (target: 'holdsAttempted' | 'holdsPrevious' | 'missing' | 'holdsOther'): InspectionResult => ({ status: 'inspected', target, temps: [] });
const attempt = (intent: WriteAttempt['intent']): WriteAttempt => ({ path: '/v/a.md', contents: 'attempted', intent });

describe('after an uncertain write: inspect first, then decide', () => {
  it('never allows a retry without an inspection', () => {
    expect(mayRetryWithoutInspecting('uncertain')).toBe(false);
    expect(mayRetryWithoutInspecting('committed')).toBe(false);
    expect(mayRetryWithoutInspecting('notCommitted')).toBe(true);
  });

  it('attempted content on disk is visible, and durability is NOT claimed', () => {
    for (const intent of [writeIntent.create, writeIntent.replace, writeIntent.upsert, writeIntent.replaceIfContent('previous')]) {
      expect(decideAfterUncertain(attempt(intent), 'previous', inspected('holdsAttempted'))).toEqual({ action: 'visible-durability-unconfirmed' });
    }
  });

  it('previous content on disk: a retry preserves the intent, and a replace becomes conditional on the observed content', () => {
    const replace = decideAfterUncertain(attempt(writeIntent.replace), 'previous', inspected('holdsPrevious'));
    const conditional = decideAfterUncertain(attempt(writeIntent.replaceIfContent('previous')), 'previous', inspected('holdsPrevious'));
    const upsert = decideAfterUncertain(attempt(writeIntent.upsert), 'previous', inspected('holdsPrevious'));

    expect(replace).toEqual({ action: 'retry', request: { path: '/v/a.md', contents: 'attempted', intent: { kind: 'replaceIfContent', expected: 'previous' } }, keepRecoveryRecord: true });
    expect(conditional).toMatchObject({ action: 'retry', request: { intent: { kind: 'replaceIfContent', expected: 'previous' } } });
    expect(upsert).toMatchObject({ action: 'retry', request: { intent: { kind: 'replaceIfContent', expected: 'previous' } } });
  });

  it('a create is only ever retried as a create', () => {
    const missing = decideAfterUncertain(attempt(writeIntent.create), null, inspected('missing'));

    expect(missing).toMatchObject({ action: 'retry', request: { intent: { kind: 'create' } } });
    // And if something else made the file meanwhile, it is a conflict, never an overwrite.
    expect(decideAfterUncertain(attempt(writeIntent.create), null, inspected('holdsOther'))).toMatchObject({ action: 'conflict', keepRecoveryRecord: true });
  });

  it('different content is never overwritten blindly, whatever the intent', () => {
    for (const intent of [writeIntent.create, writeIntent.replace, writeIntent.upsert, writeIntent.replaceIfContent('previous')]) {
      expect(decideAfterUncertain(attempt(intent), 'previous', inspected('holdsOther'))).toEqual({ action: 'conflict', keepRecoveryRecord: true });
    }
  });

  it('a missing destination is handled explicitly: a replace never silently re-creates it', () => {
    expect(decideAfterUncertain(attempt(writeIntent.replace), 'previous', inspected('missing'))).toEqual({ action: 'target-missing', keepRecoveryRecord: true });
    expect(decideAfterUncertain(attempt(writeIntent.replaceIfContent('previous')), 'previous', inspected('missing'))).toEqual({ action: 'target-missing', keepRecoveryRecord: true });
    expect(decideAfterUncertain(attempt(writeIntent.upsert), 'previous', inspected('missing'))).toMatchObject({ action: 'retry', request: { intent: { kind: 'upsert' } } });
  });

  it('an inspection that was itself refused or failed leaves the write uncertain', () => {
    for (const inspection of [{ status: 'failed', detail: 'EIO' }, { status: 'refused', reason: 'outOfScope', detail: 'd' }] as const) {
      expect(decideAfterUncertain(attempt(writeIntent.replace), 'previous', inspection)).toEqual({ action: 'still-uncertain', keepRecoveryRecord: true });
    }
  });

  it('a manual Retry gets exactly the decision an automatic one does: it cannot bypass the checks', () => {
    for (const target of ['holdsAttempted', 'holdsPrevious', 'missing', 'holdsOther'] as const) {
      for (const intent of [writeIntent.create, writeIntent.replace, writeIntent.upsert, writeIntent.replaceIfContent('previous')]) {
        expect(decideAfterUncertain(attempt(intent), 'previous', inspected(target), 'manual')).toEqual(
          decideAfterUncertain(attempt(intent), 'previous', inspected(target), 'automatic')
        );
      }
    }
  });

  it('end to end on the simulated writer: an external change after an uncertain write makes the conditional retry fail instead of overwriting', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ '/v/a.md': 'previous' });
    const writer = new InMemoryAtomicVaultWriter(fileSystem);
    writer.inject({ kind: 'uncertain', takesEffect: false });
    const first = attempt(writeIntent.replace);
    await writer.write(first);
    const decision = decideAfterUncertain(first, 'previous', await writer.inspect({ path: first.path, attempted: first.contents, previous: 'previous', tempPaths: [] }));
    if (decision.action !== 'retry') throw new Error('expected a retry');

    // Between the inspection and the retry another application changes the file.
    await fileSystem.writeFile('/v/a.md', 'external edit');
    const retried = await writer.write(decision.request);

    expect(retried).toMatchObject({ status: 'notCommitted', reason: 'staleExpected' });
    expect(await fileSystem.readFile('/v/a.md')).toBe('external edit');
  });
});

describe('durability-pending revisions and recovery cleanup are tied to content, never just the page', () => {
  const N = 'revision N';
  const N1 = 'revision N+1';

  it('a pending revision blocks removal of the record that holds it, until it is confirmed', () => {
    const ledger = new DurabilityLedger();
    const attempt = ledger.add('page', 1, N);
    const may = () => mayRemoveRecoveryRecord({ ledger, pageId: 'page', noUnsavedChanges: true, recordContent: N });

    expect(may()).toBe(false);
    ledger.confirmed(attempt.attemptId);
    expect(may()).toBe(true);
  });

  it('the old rule stays necessary: unsaved changes still block removal', () => {
    expect(mayRemoveRecoveryRecord({ ledger: new DurabilityLedger(), pageId: 'page', noUnsavedChanges: false, recordContent: N })).toBe(false);
  });

  it('retiring revision N because N+1 superseded it does NOT release N+1’s record when N+1 is itself still unconfirmed', () => {
    const ledger = new DurabilityLedger();
    const attemptN = ledger.add('page', 1, N);
    const attemptN1 = ledger.add('page', 2, N1); // N+1 was committed with unconfirmed durability too

    ledger.superseded(attemptN.attemptId); // confirmDurability(N) answered "superseded": N+1 is what is on disk

    expect(ledger.isPending('page', N)).toBe(false);
    expect(ledger.isPending('page', N1)).toBe(true);
    expect(mayRemoveRecoveryRecord({ ledger, pageId: 'page', noUnsavedChanges: true, recordContent: N1 })).toBe(false);
    ledger.confirmed(attemptN1.attemptId);
    expect(mayRemoveRecoveryRecord({ ledger, pageId: 'page', noUnsavedChanges: true, recordContent: N1 })).toBe(true);
  });

  it('a newer version being visible on disk is not a durability confirmation: superseding N creates no confirmation for N+1', () => {
    const ledger = new DurabilityLedger();
    const attemptN = ledger.add('page', 1, N);
    ledger.add('page', 2, N1);

    ledger.superseded(attemptN.attemptId);

    expect(ledger.pendingFor('page').map((entry) => entry.revision)).toEqual([2]);
  });

  it('confirming N while N+1 is a different, unsaved edit never releases N+1’s record', () => {
    const ledger = new DurabilityLedger();
    const attempt = ledger.add('page', 1, N);

    ledger.confirmed(attempt.attemptId);

    expect(mayRemoveRecoveryRecord({ ledger, pageId: 'page', noUnsavedChanges: false, recordContent: N1 })).toBe(false);
  });

  it('entries are keyed per page: the same content pending on one page does not block another', () => {
    const ledger = new DurabilityLedger();
    ledger.add('page-a', 1, N);

    expect(mayRemoveRecoveryRecord({ ledger, pageId: 'page-b', noUnsavedChanges: true, recordContent: N })).toBe(true);
    ledger.clearPage('page-a');
    expect(ledger.pendingFor('page-a')).toEqual([]);
  });

  it('end to end on the simulated writer: N unconfirmed, then N+1 committed; confirming N answers superseded and leaves N+1 pending', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ '/v/a.md': 'old' });
    const writer = new InMemoryAtomicVaultWriter(fileSystem);
    const ledger = new DurabilityLedger();
    writer.inject({ kind: 'durability-unconfirmed' }).inject({ kind: 'durability-unconfirmed' });

    const attempts: number[] = [];
    for (const [revision, contents] of [[1, N], [2, N1]] as const) {
      const outcome = await writer.write({ path: '/v/a.md', contents, intent: writeIntent.replace });
      if (outcome.status === 'committed' && outcome.durability.status === 'unconfirmed') attempts.push(ledger.add('page', revision, contents).attemptId);
    }
    const answer = await writer.confirmDurability('/v/a.md', N);
    if (answer.status === 'superseded') ledger.superseded(attempts[0]!);

    expect(answer).toEqual({ status: 'superseded' });
    expect(ledger.pendingFor('page').map((entry) => entry.revision)).toEqual([2]);
    expect(mayRemoveRecoveryRecord({ ledger, pageId: 'page', noUnsavedChanges: true, recordContent: N1 })).toBe(false);
  });

  describe('A -> B -> A: identical bytes saved twice are two attempts', () => {
    it('confirming or superseding the older A does not clear protection for the newer A', () => {
      for (const answer of ['confirmed', 'superseded'] as const) {
        const ledger = new DurabilityLedger();
        const firstA = ledger.add('page', 1, N);
        ledger.add('page', 2, N1);
        const secondA = ledger.add('page', 3, N);

        ledger[answer](firstA.attemptId);

        expect(ledger.isPending('page', N)).toBe(true);
        expect(ledger.pendingFor('page').map((entry) => entry.attemptId)).toContain(secondA.attemptId);
        expect(mayRemoveRecoveryRecord({ ledger, pageId: 'page', noUnsavedChanges: true, recordContent: N })).toBe(false);
      }
    });

    it('the record is released only once every attempt holding that content has been answered', () => {
      const ledger = new DurabilityLedger();
      const firstA = ledger.add('page', 1, N);
      const secondA = ledger.add('page', 3, N);
      const may = () => mayRemoveRecoveryRecord({ ledger, pageId: 'page', noUnsavedChanges: true, recordContent: N });

      ledger.confirmed(firstA.attemptId);
      expect(may()).toBe(false);
      ledger.confirmed(secondA.attemptId);
      expect(may()).toBe(true);
    });

    it('a late or repeated answer for an attempt already retired changes nothing', () => {
      const ledger = new DurabilityLedger();
      const firstA = ledger.add('page', 1, N);
      const secondA = ledger.add('page', 3, N);

      ledger.superseded(firstA.attemptId);
      ledger.confirmed(firstA.attemptId);
      ledger.superseded(firstA.attemptId);

      expect(ledger.pendingFor('page').map((entry) => entry.attemptId)).toEqual([secondA.attemptId]);
    });

    it('attempt ids are unique even for the same page and content', () => {
      const ledger = new DurabilityLedger();

      expect(ledger.add('page', 1, N).attemptId).not.toBe(ledger.add('page', 1, N).attemptId);
    });
  });
});
