import { useCallback, useEffect, useRef, useState } from 'react';
import { hasOpenOverlay } from '@components/overlay/hooks/useEscape';
import type { CollectionItemSelection } from '@features/collection/components/entry/CollectionSelectionCheckbox';

export interface CollectionSelection {
  /** The selection a checkbox for this item carries: `label` is the item's name, for the checkbox's accessible name. */
  selectionFor(id: string, label: string): CollectionItemSelection;
  /** The checked ids that are still shown, in the body's order. */
  readonly selectedIds: readonly string[];
  /** How many items the body shows — what "all" means for Select all. */
  readonly total: number;
  /** Selection mode: at least one shown item is checked. */
  readonly active: boolean;
  isChecked(id: string): boolean;
  /** Makes `id` the only checked item. */
  selectOnly(id: string): void;
  /** Checks every item the body shows (the ids it was given). */
  selectAll(): void;
  /** Unchecks everything — and so leaves selection mode. */
  clear(): void;
  /** Makes exactly `ids` the checked items (those the body no longer shows are dropped). */
  setSelected(ids: readonly string[]): void;
}

/**
 * What takes the keys while it has focus: a field, an editor or anything editable. Escape (and every other key) pressed there
 * is that control's own — the same set the selection's Delete / Backspace shortcut leaves alone.
 */
const FIELD_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor';

function targetOwnsKeys(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(FIELD_SELECTOR) !== null;
}

/**
 * Which items of a collection body are checked — React state of the body that shows them, nothing more: it is
 * never saved, and it has no meaning beyond the checkboxes (no actions act on it yet). Items are independent
 * (checking one leaves the others as they are), and while at least one is checked the body is in selection mode (`active`), and an id that is no longer among `ids` (the body now shows
 * another folder, or the item is gone) is dropped.
 *
 * Escape leaves selection mode: while the mode is on, it clears the whole selection (the checkboxes, the selected styling and
 * the ids all follow from that one state, so every layout — list, table, note, asset and folder cards, the trash — resets the
 * same way). It is registered only while the mode is on, so with nothing selected Escape is not touched at all, and it stands aside for
 * whatever else answers Escape: an open overlay (the key closes that first, and the selection stays for the next Escape), a
 * field or editor with focus, a drag or marquee in progress (they consume the key before it gets here), and anything that
 * has already handled it (`defaultPrevented`).
 */
export function useCollectionSelection(ids: readonly string[]): CollectionSelection {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());

  // Prune by content, not identity: `ids` is a fresh array every render.
  const key = ids.join('\n');
  useEffect(() => {
    const present = new Set(key ? key.split('\n') : []);
    setChecked((current) => {
      const kept = [...current].filter((id) => present.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [key]);

  const toggle = useCallback((id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Selection mode: something visible is checked (computed here, so a just-removed item never leaves it on for a render).
  const present = new Set(ids);
  const active = [...checked].some((id) => present.has(id));

  const selectedIds = ids.filter((id) => checked.has(id));
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    if (!active) {
      return;
    }

    // The keys this Escape went down with an overlay open. Noted in the capture phase, before the overlay's own handler
    // runs: the overlay closes on this very key, and a check made after it would find none open and clear the selection too.
    const claimedByOverlay = new WeakSet<Event>();
    const noteOverlay = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && hasOpenOverlay()) {
        claimedByOverlay.add(event);
      }
    };
    // Acts on `window`, after every `document` handler: one that consumed the key (a drag or marquee, cancelled in the
    // capture phase, never gets here; the cover's repositioning cancels in the bubble phase and says so with `preventDefault`).
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (claimedByOverlay.has(event) || targetOwnsKeys(event.target)) {
        return;
      }
      setChecked(new Set());
    };

    document.addEventListener('keydown', noteOverlay, true);
    window.addEventListener('keydown', clearOnEscape);
    return () => {
      document.removeEventListener('keydown', noteOverlay, true);
      window.removeEventListener('keydown', clearOnEscape);
    };
  }, [active]);

  return {
    selectedIds,
    total: ids.length,
    active,
    isChecked: (id) => checked.has(id),
    selectOnly: (id) => setChecked(new Set([id])),
    selectAll: () => setChecked(new Set(idsRef.current)),
    clear: () => setChecked(new Set()),
    setSelected: (next) => setChecked(new Set(next.filter((id) => idsRef.current.includes(id)))),
    selectionFor: (id, label) => ({ id, checked: checked.has(id), active, onToggle: () => toggle(id), label: `Select ${label}` }),
  };
}
