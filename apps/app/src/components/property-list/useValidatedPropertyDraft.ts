import { useRef, useState, type KeyboardEvent } from 'react';

import { useRejectShake } from './useRejectShake';

/** Number and URL share a draft/commit lifecycle; parsing and display stay type-specific. */
export function useValidatedPropertyDraft<T extends string | number>(
  value: T | null,
  parse: (text: string) => T | null,
  onCommit: (value: T | null) => void
) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const { shakeClassName, shake } = useRejectShake();

  function commitDraft(text: string): boolean {
    const empty = text.trim() === '';
    const parsed = empty ? null : parse(text);
    if (!empty && parsed === null) return false;
    if (parsed !== value) onCommit(parsed);
    return true;
  }

  function startEditing(text: string) {
    cancelled.current = false;
    setDraft(text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === 'Escape') {
      if (draft === null) return;
      event.preventDefault();
      cancelled.current = true;
      setDraft(null);
      event.currentTarget.blur();
      return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (draft !== null && !commitDraft(draft)) {
      shake();
      return;
    }
    setDraft(null);
  }

  function handleBlur() {
    if (!cancelled.current && draft !== null) commitDraft(draft);
    cancelled.current = false;
    setDraft(null);
  }

  return { draft, setDraft, startEditing, handleKeyDown, handleBlur, shakeClassName, isEditing: draft !== null };
}
