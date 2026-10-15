/**
 * The lists a drag has temporarily revealed by resting on their "N more" row (see useDropTargetTracking), as one
 * tiny external store: whichever surface the drag began on, the sidebar's trees read the same state, so a drag
 * from a Collection View reveals hidden siblings exactly as a drag within the sidebar does. Never persisted and
 * never merged into the user's own expansion; cleared when the drag ends.
 */
type Listener = () => void;

let revealed: readonly string[] = [];
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((listener) => listener());

export const dragRevealStore = {
  get: (): readonly string[] => revealed,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reveal(capKey: string): void {
    if (!revealed.includes(capKey)) {
      revealed = [...revealed, capKey];
      emit();
    }
  },
  clear(): void {
    if (revealed.length > 0) {
      revealed = [];
      emit();
    }
  },
};
