import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Application } from '@core/application/Application';
import { useWorkspace } from '@app/hooks/useWorkspace';
import { useSaveFailures } from '@app/layouts/page/useSaveFailures';
import { SaveFailureElsewhereNotice, SaveFailureNotice, RecoveryNotice } from '@app/layouts/page/topbar/SaveFailureNotice';
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
  const otherFailedIds = failures.failedIds.filter((id) => id !== activePageId);
  const noteLabel = (id: string): string => vault.getPage(id)?.name || pageOperations.getDraft(id)?.title || 'an untitled note';

  const status = (
    <>
      {activeStatus !== null && activePageId ? (
        <SaveFailureNotice status={activeStatus} onRetry={() => void pageOperations.retrySave(activePageId)} />
      ) : otherFailedIds.length > 0 ? (
        <SaveFailureElsewhereNotice
          label={otherFailedIds.length === 1 ? `“${noteLabel(otherFailedIds[0]!)}”` : `${otherFailedIds.length} other notes`}
          onOpen={() => void pageOperations.open(otherFailedIds[0]!)}
        />
      ) : null}
      {candidates.length > 0 && <RecoveryNotice count={candidates.length} onReview={() => setReviewOpen(true)} />}
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
