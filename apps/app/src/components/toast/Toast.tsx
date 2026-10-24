import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@components/button/Button';
import './Toast.css';

export interface ToastMessage {
  /** Changes per toast, so a new toast restarts the dismiss timer even when its text repeats. */
  readonly id: number;
  readonly text: string;
  readonly tone: 'default' | 'error';
  /** An optional follow-up the toast offers ("Open", "Undo"); pressing it also dismisses the toast. */
  readonly action?: { readonly label: string; readonly onAction: () => void };
  /** Overrides the default duration for this toast. */
  readonly durationMs?: number;
}

interface ToastProps {
  readonly toast: ToastMessage | null;
  readonly onDismiss: () => void;
  readonly durationMs?: number;
}

/** A plain confirmation is read at a glance; an error or an offered action needs time to read and reach. */
const SIMPLE_DURATION_MS = 4000;
const LONG_DURATION_MS = 8000;

export function defaultToastDuration(toast: Pick<ToastMessage, 'tone' | 'action'>): number {
  return toast.tone === 'error' || toast.action ? LONG_DURATION_MS : SIMPLE_DURATION_MS;
}

/** Longest an exit animation is waited for before the toast is removed anyway (the token is 120ms). */
const EXIT_FALLBACK_MS = 600;

/**
 * A transient, non-blocking message at the bottom of the window; dismisses itself. It waits while the
 * pointer is over it or focus is inside it, and starts its full duration again once both have left.
 * An error is announced as an alert, anything else as a status.
 *
 * It slides up into view and, once `toast` goes `null`, slides down before it leaves the DOM. A toast that
 * replaces the one on screen changes in place — no exit, no second entrance — so notifications never overlap
 * or flicker. Where there is no animation (reduced motion, or no CSS) it leaves at once.
 */
export function Toast({ toast, onDismiss, durationMs }: ToastProps) {
  const id = toast?.id;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // The last toast shown: kept while the exit animation plays, after `toast` itself has gone.
  const [last, setLast] = useState<ToastMessage | null>(toast);
  const ref = useRef<HTMLDivElement>(null);
  const paused = hovered || focused;
  const visible = toast ?? last;
  const leaving = toast === null && last !== null;
  const duration = durationMs ?? toast?.durationMs ?? (toast ? defaultToastDuration(toast) : SIMPLE_DURATION_MS);

  useEffect(() => {
    if (toast) {
      setLast(toast);
    }
  }, [toast]);

  // A new toast starts unpaused: the pointer or focus that held the previous one says nothing about it.
  useEffect(() => {
    setHovered(false);
    setFocused(false);
  }, [id]);

  useEffect(() => {
    if (id === undefined || paused) {
      return;
    }
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [id, paused, duration, onDismiss]);

  // Leaving: wait for the exit animation to end, then remove the toast. With no animation running there is
  // nothing to wait for.
  useEffect(() => {
    if (!leaving) {
      return;
    }
    const node = ref.current;
    const animation = node ? window.getComputedStyle(node).animationName : 'none';
    if (!node || !animation || animation === 'none') {
      setLast(null);
      return;
    }
    const finish = (event: Event) => {
      if (event.target === node) {
        setLast(null);
      }
    };
    node.addEventListener('animationend', finish);
    const fallback = window.setTimeout(() => setLast(null), EXIT_FALLBACK_MS);
    return () => {
      node.removeEventListener('animationend', finish);
      window.clearTimeout(fallback);
    };
  }, [leaving]);

  if (!visible) {
    return null;
  }

  const { action } = visible;
  const isError = visible.tone === 'error';

  // Portaled to <body>, like Overlay, so it sits above overlays and dialogs instead of losing the DOM-order
  // tiebreak to a later-mounted one.
  return createPortal(
    <div
      ref={ref}
      className={`toast toast--${visible.tone}${action ? ' toast--with-action' : ''}${leaving ? ' toast--leaving' : ''}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-hidden={leaving || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
      <div className="toast__message">{visible.text}</div>
      {action && (
        <div className="toast__actions">
          <Button
            onClick={() => {
              action.onAction();
              onDismiss();
            }}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>,
    document.body
  );
}
