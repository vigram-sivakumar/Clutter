/**
 * TEMPORARY — a gallery of the crash-recovery UI, for CSS work. Open /recovery-ui.html on the dev server (HMR applies).
 * It renders the real components with the real CSS and fake data; nothing here touches a vault. Delete this file and
 * apps/app/recovery-ui.html when the styling is done.
 */
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import '../../design-system/tokens.css';
import '../../design-system/theme.css';
import '../../design-system/syntax-tokens.css';
import '../../design-system/styles/base.css';
import '../../design-system/styles/font.css';
import '../../design-system/styles/utilities.css';

import { RecoveryDialog } from '../layouts/app-layout/status/RecoveryDialog';
import { RecoveryNotice, SaveFailureNotice } from '../layouts/page/topbar/SaveFailureNotice';
import { UnsavedCloseDialog } from '../UnsavedCloseDialog';
import { ToastProvider, useToast } from '@components/toast/ToastProvider';
import type { RecoveryCandidate } from '@core/application/recovery/RecoveryOperations';

const candidate = (over: Partial<RecoveryCandidate> & { key: string; label: string }): RecoveryCandidate => {
  const { label, ...rest } = over;
  return {
    entry: { dir: 'd', name: over.key, record: {} as never },
    duplicates: [],
    record: { label, capturedAt: '2026-10-28T09:44:46.000Z' } as never,
    outcome: 'recoverable',
    changes: ['body'],
    reasons: [],
    ...rest,
  };
};

const SCENARIOS: Record<string, readonly RecoveryCandidate[]> = {
  'One note (recoverable)': [candidate({ key: 'a', label: 'Launch plan' })],
  'Several notes, mixed': [
    candidate({ key: 'a', label: 'Launch plan', changes: ['body', 'title'] }),
    candidate({
      key: 'b',
      label: 'Weekly review',
      outcome: 'conflict',
      reasons: ['The text of this note changed in your vault after these edits were captured'],
    }),
    candidate({ key: 'c', label: 'Deleted note', outcome: 'missing-note', reasons: ['This note is no longer in your vault'] }),
    candidate({ key: 'd', label: 'Untitled draft', outcome: 'draft', changes: ['body', 'title', 'description'], reasons: ['This note was never saved'] }),
  ],
};

type View = 'recovery-one' | 'recovery-many' | 'switch-kept' | 'switch-lost' | 'close' | 'close-many' | null;

const noop = async () => {};

function Row({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--text-secondary, #888)' }}>{title}</h3>
      {note && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-tertiary, #777)' }}>{note}</p>}
      {children}
    </section>
  );
}

function Gallery() {
  const toast = useToast();
  const [persistentId, setPersistentId] = useState<number | null>(null);
  const [view, setView] = useState<View>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => document.documentElement.setAttribute('data-theme', theme), [theme]);
  const open = (v: View) => () => setView(v);
  const close = () => setView(null);
  const btn = (v: View, label: string) => (
    <button key={label} type="button" onClick={open(v)} style={{ marginRight: 8, padding: '6px 10px' }}>
      {label}
    </button>
  );

  return (
    <div style={{ padding: 32, maxWidth: 760, color: 'var(--foreground-primary, var(--text-primary, #eee))', fontFamily: 'var(--font-sans, system-ui)' }}>
      <h2 style={{ marginTop: 0 }}>Crash-recovery UI</h2>
      <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ marginBottom: 20, padding: '6px 10px' }}>
        Theme: {theme}
      </button>

      <Row title="Top bar notices" note="Rendered in the top bar, only for the open note. A failure in any other note is the persistent danger toast below.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <SaveFailureNotice status="retrying" onRetry={() => {}} />
          <SaveFailureNotice status="retry-scheduled" onRetry={() => {}} />
          <SaveFailureNotice status="needs-action" onRetry={() => {}} />
          <RecoveryNotice onReview={() => {}} />
        </div>
      </Row>

      <Row title="Toasts" note="Fixed at the bottom centre of the window. The persistent one stays until the Dismiss button (its owner) removes it; its action does not.">
        <button type="button" style={{ marginRight: 8, padding: '6px 10px' }} onClick={() => toast.show({ text: 'Link copied' })}>
          Default
        </button>
        <button type="button" style={{ marginRight: 8, padding: '6px 10px' }} onClick={() => toast.show({ tone: 'error', text: 'Couldn’t save changes' })}>
          Error (existing)
        </button>
        <button type="button" style={{ marginRight: 8, padding: '6px 10px' }} onClick={() => toast.show({ tone: 'danger', text: 'Couldn’t save changes' })}>
          Danger
        </button>
        <button
          type="button"
          style={{ marginRight: 8, padding: '6px 10px' }}
          onClick={() => setPersistentId(toast.show({ tone: 'danger', persistent: true, text: <>Couldn’t save changes in “<span className="toast__name">Launch plan</span>”</>, action: { label: 'Open', onAction: () => {} } }))}
        >
          Danger, persistent, with Open (other note failed)
        </button>
        <button
          type="button"
          style={{ marginRight: 8, padding: '6px 10px' }}
          onClick={() => setPersistentId(toast.show({ tone: 'danger', persistent: true, text: <>Couldn’t save changes in “<span className="toast__name">Quarterly planning notes for the whole product and design organisation, second draft</span>”</>, action: { label: 'Open', onAction: () => {} } }))}
        >
          Long title
        </button>
        <button
          type="button"
          style={{ marginRight: 8, padding: '6px 10px' }}
          onClick={() => setPersistentId(toast.show({ persistent: true, text: <>Unsaved changes found in “<span className="toast__name">Launch plan</span>”</>, action: { label: 'Review', onAction: () => {} } }))}
        >
          Recovered work in another note (persistent)
        </button>
        <button type="button" style={{ padding: '6px 10px' }} onClick={() => persistentId !== null && toast.dismiss(persistentId)}>
          Dismiss it (what a successful save would do)
        </button>
      </Row>

      <Row title="Recovery dialog" note="On a card, click Discard to see the confirmation step; Restore / Discard / Cancel work on fake handlers.">
        {btn('recovery-one', 'One note')}
        {btn('recovery-many', 'Several notes (recoverable, conflict, missing, draft)')}
      </Row>

      <Row title="Unsaved-changes dialogs" note="Leaving a Space and closing Clutter.">
        {btn('switch-kept', 'Switch Space — recovery copy kept')}
        {btn('switch-lost', 'Switch Space — no copy confirmed')}
        {btn('close', 'Close — 1 note')}
        {btn('close-many', 'Close — 3 notes')}
      </Row>

      <RecoveryDialog
        open={view === 'recovery-one' || view === 'recovery-many'}
        candidates={SCENARIOS[view === 'recovery-many' ? 'Several notes, mixed' : 'One note (recoverable)']!}
        onRestore={noop}
        onDiscard={noop}
        onClose={close}
      />
      <UnsavedCloseDialog unsavedCount={view === 'switch-kept' ? 2 : view === 'switch-lost' ? 1 : null} action="switch" onAnswer={close} />
      <UnsavedCloseDialog unsavedCount={view === 'close' ? 1 : view === 'close-many' ? 3 : null} action="close" onAnswer={close} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  </StrictMode>
);
