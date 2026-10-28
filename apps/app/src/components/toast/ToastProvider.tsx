import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toast, type ToastMessage } from './Toast';

export interface ToastInput {
  /** Plain text, or text with a name in typographic double quotes (see `ToastMessage.text`). */
  readonly text: ToastMessage['text'];
  /** Default `default`. An `error` or `danger` is announced as an alert and outranks everything else. */
  readonly tone?: ToastMessage['tone'];
  /** An offered follow-up ("Undo", "Open"). A toast with one is not replaced by a routine confirmation. */
  readonly action?: ToastMessage['action'];
  readonly durationMs?: number;
  /** Never dismisses itself: it stays until `dismiss(id)` or its action. For a state that lasts until it is fixed. */
  readonly persistent?: boolean;
}

export interface ToastApi {
  /**
   * Shows `input` and returns its handle, or `null` when it was not shown because an error or an
   * actionable toast is on screen and `input` is a routine confirmation.
   */
  show(input: ToastInput): number | null;
  /** Reports a failure: an error toast, plus `error` to the console so the diagnostics are kept. */
  fail(text: string, error?: unknown): number | null;
  /** Dismisses the toast `id` named by `show`, if it is still the one on screen. */
  dismiss(id: number): void;
}

/**
 * Importance of what is on screen: an error beats an offered action, which beats a routine confirmation.
 * A toast replaces the current one unless it ranks lower.
 */
function rank(input: Pick<ToastInput, 'tone' | 'action'>): number {
  if (input.tone === 'error' || input.tone === 'danger') {
    return 2;
  }
  return input.action ? 1 : 0;
}

const noop: ToastApi = {
  show: () => null,
  fail: (text, error) => {
    if (error !== undefined) {
      console.error(text, error);
    }
    return null;
  },
  dismiss: () => {},
};

const ToastContext = createContext<ToastApi>(noop);

/** The one toast API. Outside a `ToastProvider` it shows nothing (and still logs `fail` diagnostics). */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

/**
 * The app's single toast host: at most one toast is visible, and there is no queue. A routine
 * confirmation that arrives while an error or an actionable toast is showing is dropped rather than
 * deferred — shown seconds later it would describe something no longer relevant. An equal or higher
 * priority toast replaces the current one.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const current = useRef<{ readonly id: number; readonly rank: number } | null>(null);
  const lastId = useRef(0);

  const show = useCallback((input: ToastInput): number | null => {
    const incoming = rank(input);

    if (current.current && incoming < current.current.rank) {
      return null;
    }

    const id = ++lastId.current;
    current.current = { id, rank: incoming };
    setToast({
      id,
      text: input.text,
      tone: input.tone ?? 'default',
      ...(input.action ? { action: input.action } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.persistent ? { persistent: true } : {}),
    });
    return id;
  }, []);

  const dismiss = useCallback((id: number): void => {
    if (current.current?.id === id) {
      current.current = null;
      setToast(null);
    }
  }, []);

  const fail = useCallback(
    (text: string, error?: unknown): number | null => {
      if (error !== undefined) {
        console.error(text, error);
      }
      return show({ tone: 'error', text });
    },
    [show]
  );

  const api = useMemo<ToastApi>(() => ({ show, fail, dismiss }), [show, fail, dismiss]);
  const dismissCurrent = useCallback(() => {
    if (current.current) {
      dismiss(current.current.id);
    }
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toast toast={toast} onDismiss={dismissCurrent} />
    </ToastContext.Provider>
  );
}
