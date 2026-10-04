import { useEffect } from 'react';
import './Toast.css';

export interface ToastMessage {
  /** Changes per toast, so a new toast restarts the dismiss timer even when its text repeats. */
  readonly id: number;
  readonly text: string;
  readonly tone: 'default' | 'error';
}

interface ToastProps {
  readonly toast: ToastMessage | null;
  readonly onDismiss: () => void;
  readonly durationMs?: number;
}

/** A transient, non-blocking message at the bottom of the window; dismisses itself. */
export function Toast({ toast, onDismiss, durationMs = 4000 }: ToastProps) {
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined) {
      return;
    }
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [id, durationMs, onDismiss]);

  if (!toast) {
    return null;
  }

  return (
    <div className={`toast toast--${toast.tone}`} role="status" aria-live="polite">
      {toast.text}
    </div>
  );
}
