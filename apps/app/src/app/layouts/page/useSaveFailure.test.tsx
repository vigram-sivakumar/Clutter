// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSession } from '@core/engine/DocumentSession';
import { DocumentTransaction } from '@core/engine/DocumentTransaction';
import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { useSaveFailure } from './useSaveFailure';
import { SaveFailureNotice } from './topbar/SaveFailureNotice';

const fail = vi.fn();
vi.mock('@components/toast/ToastProvider', () => ({
  useToast: () => ({ fail, show: vi.fn(), dismiss: vi.fn() }),
}));

/** The shape PageHost uses: observe the session, then show the notice while the failure is unresolved. */
function TopBarProbe({ session }: { session: DocumentSession }) {
  const observed = useDocumentSession(session);
  const failing = useSaveFailure(observed);
  return failing ? <SaveFailureNotice /> : <span>no notice</span>;
}

function editAndFail(session: DocumentSession, text: string) {
  act(() => {
    session.commit(new DocumentTransaction(text));
    session.beginSave();
    session.markSaveFailed();
  });
}

function retry(session: DocumentSession) {
  act(() => session.beginSave());
}

function succeed(session: DocumentSession) {
  act(() => {
    session.beginSave();
    session.markSaved(session.currentRevision);
  });
}

beforeEach(() => {
  fail.mockClear();
});
afterEach(cleanup);

describe('the save-failure state of the open document', () => {
  it('shows a persistent notice once a save fails, and nothing before', () => {
    const session = new DocumentSession('page', 'body');
    render(<TopBarProbe session={session} />);
    expect(screen.queryByTestId('save-failure-notice')).toBeNull();

    editAndFail(session, 'edited');

    expect(screen.getByTestId('save-failure-notice')).toHaveTextContent('Couldn’t save changes');
  });

  it('keeps showing it while an automatic retry is in flight: the changes are still unsaved', () => {
    const session = new DocumentSession('page', 'body');
    render(<TopBarProbe session={session} />);
    editAndFail(session, 'edited');

    retry(session); // Saving, still dirty

    expect(screen.getByTestId('save-failure-notice')).toBeInTheDocument();
  });

  it('clears when a later save succeeds, and only then', () => {
    const session = new DocumentSession('page', 'body');
    render(<TopBarProbe session={session} />);
    editAndFail(session, 'edited');
    retry(session);
    act(() => session.markSaveFailed());
    expect(screen.getByTestId('save-failure-notice')).toBeInTheDocument();

    succeed(session);

    expect(screen.queryByTestId('save-failure-notice')).toBeNull();
    expect(screen.getByText('no notice')).toBeInTheDocument();
  });

  it('announces a failure streak with one toast, however many retries fail', () => {
    const session = new DocumentSession('page', 'body');
    render(<TopBarProbe session={session} />);

    editAndFail(session, 'edited');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      retry(session);
      act(() => session.markSaveFailed());
    }

    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('a further edit during a failure is not a new failure: no second toast', () => {
    const session = new DocumentSession('page', 'body');
    render(<TopBarProbe session={session} />);
    editAndFail(session, 'edited');

    act(() => {
      session.commit(new DocumentTransaction('edited more'));
      session.beginSave();
      session.markSaveFailed();
    });

    expect(fail).toHaveBeenCalledTimes(1);
  });

  it('a new failure after recovery is announced again', () => {
    const session = new DocumentSession('page', 'body');
    render(<TopBarProbe session={session} />);
    editAndFail(session, 'one');
    succeed(session);

    editAndFail(session, 'two');

    expect(fail).toHaveBeenCalledTimes(2);
  });
});
