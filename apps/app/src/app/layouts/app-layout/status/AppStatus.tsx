import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Application } from '@core/application/Application';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { useSaveFailures } from '@app/layouts/page/useSaveFailures';
import { useToast } from '@components/toast/ToastProvider';
import { SaveFailureNotice, RecoveryNotice } from '@app/layouts/page/topbar/SaveFailureNotice';
import { RecoveryDialog } from './RecoveryDialog';
import { useRecovery } from './useRecovery';

const AppStatusContext = createContext<ReactNode>(null);

/** What the top bar shows about the application's state (failed saves, recovered work). Empty when all is well. */
export function useAppStatus(): ReactNode {
  return useContext(AppStatusContext);
}

/**
 * The one owner of application-wide status: failed saves in any note (the open one gets a Retry, another gets a
 * pointer back to it), and unsaved work recovered from an earlier session. It lives above every view, so the status is
 * the same on notes, collections, tags and favorites, and a failure toast is raised in one place only.
 */
export function AppStatusProvider({ application, children }: { application: Application; children: ReactNode }) {
  const workspace = useWorkspace(application.workspace);
  const { pageOperations, recoveryOperations, vault } = application;
  const failures = useSaveFailures(pageOperations);
  const candidates = useRecovery(recoveryOperations);
  const [reviewOpen, setReviewOpen] = useState(false);
  const offeredRef = useRef(false);

  // Recovered work is offered once, when it is first found at startup; afterwards the notice below reopens it.
  useEffect(() => {
    if (candidates.length > 0 && !offeredRef.current) {
      offeredRef.current = true;
      setReviewOpen(true);
    }
  }, [candidates.length]);

  const activePageId = workspace.activePageId;
  const activeStatus = activePageId ? failures.statusOf(activePageId) : null;
  const noteLabel = (id: string): string => vault.getPage(id)?.name || pageOperations.getDraft(id)?.title || 'an untitled note';

  // The top bar speaks only about the open note. A note that fails while it is not the open one (or while no note is open)
  // is a persistent danger toast with a way to open it. The toast belongs to the failure, not to the open note: switching
  // notes, even to the failing one, leaves it up, and it goes only when that note's changes are saved.
  const toast = useToast();
  const [elsewhere, setElsewhere] = useState<readonly string[]>([]);
  const failedKey = failures.failedIds.join('\n');

  useEffect(() => {
    const failed = failures.failedIds;

    setElsewhere((previous) => {
      const kept = previous.filter((id) => failed.includes(id));
      const added = failed.filter((id) => id !== activePageId && !kept.includes(id));
      const next = [...kept, ...added];

      return next.length === previous.length && next.every((id, index) => id === previous[index]) ? previous : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `failedKey` stands for `failures.failedIds`
  }, [failedKey, activePageId]);

  const firstElsewhereId = elsewhere[0];
  const elsewhereCount = elsewhere.length;
  // Strings, so the effect below runs only when what the toast says changes.
  const firstElsewhereName = firstElsewhereId === undefined ? '' : noteLabel(firstElsewhereId);

  useEffect(() => {
    if (firstElsewhereId === undefined) return;
    const id = toast.show({
      tone: 'danger',
      persistent: true,
      text: (
        <>
          Couldn’t save changes in {elsewhereCount === 1 ? (
            <>
              “<span className="toast__name" title={firstElsewhereName}>{firstElsewhereName}</span>”
            </>
          ) : (
            `${elsewhereCount} other notes`
          )}
        </>
      ),
      action: { label: 'Open', onAction: () => void pageOperations.open(firstElsewhereId) },
    });

    return () => {
      if (id !== null && id !== undefined) toast.dismiss(id);
    };
  }, [elsewhereCount, firstElsewhereId, firstElsewhereName, toast, pageOperations]);

  // Recovered work follows the same rule as a failed save: the top bar speaks about the open note only, and recovered
  // work for any other note is a persistent toast (kept while the user switches notes, gone once it is restored or
  // discarded). Because one toast shows at a time, it is raised again when the failure toast above goes away.
  const [recoveryElsewhere, setRecoveryElsewhere] = useState<readonly string[]>([]);
  const candidateKey = candidates.map((candidate) => `${candidate.key}:${candidate.record.pageId}`).join('\n');

  useEffect(() => {
    setRecoveryElsewhere((previous) => {
      const kept = previous.filter((key) => candidates.some((candidate) => candidate.key === key));
      const added = candidates
        .filter((candidate) => candidate.record.pageId !== activePageId && !kept.includes(candidate.key))
        .map((candidate) => candidate.key);
      const next = [...kept, ...added];

      return next.length === previous.length && next.every((key, index) => key === previous[index]) ? previous : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `candidateKey` stands for `candidates`
  }, [candidateKey, activePageId]);

  const recoveryElsewhereCount = recoveryElsewhere.length;
  const firstRecoveryLabel = candidates.find((candidate) => candidate.key === recoveryElsewhere[0])?.record.label ?? '';
  const failureToastCount = elsewhere.length;

  useEffect(() => {
    if (recoveryElsewhereCount === 0) return;
    const id = toast.show({
      persistent: true,
      text:
        // Same template as the failed-save toast: the message, then "in", then the name last.
        <>
          Unsaved changes found in{' '}
          {recoveryElsewhereCount === 1 ? (
            <>
              “<span className="toast__name" title={firstRecoveryLabel}>{firstRecoveryLabel}</span>”
            </>
          ) : (
            `${recoveryElsewhereCount} other notes`
          )}
        </>,
      action: { label: 'Review', onAction: () => setReviewOpen(true) },
    });

    return () => {
      if (id !== null && id !== undefined) toast.dismiss(id);
    };
  }, [recoveryElsewhereCount, firstRecoveryLabel, failureToastCount, toast]);

  const status = (
    <>
      {activeStatus !== null && activePageId ? (
        <SaveFailureNotice status={activeStatus} onRetry={() => void pageOperations.retrySave(activePageId)} />
      ) : null}
      {candidates.some((candidate) => candidate.record.pageId === activePageId) && (
        <RecoveryNotice onReview={() => setReviewOpen(true)} />
      )}
    </>
  );

  return (
    <AppStatusContext.Provider value={status}>
      {children}
      <RecoveryDialog
        open={reviewOpen}
        candidates={candidates}
        onRestore={(key) => recoveryOperations!.restore(key)}
        onDiscard={(key) => recoveryOperations!.discard(key)}
        onClose={() => setReviewOpen(false)}
      />
    </AppStatusContext.Provider>
  );
}
