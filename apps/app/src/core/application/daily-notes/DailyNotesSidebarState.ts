import type { ChangeListener, Observable } from '../../shared/Observable';

/**
 * Runtime owner of the Daily Notes sidebar's "Show earlier" / "Show
 * upcoming" expansion (ADR-035 §2) — deliberately its own tiny object, not
 * fields on `Workspace`: this is Daily Notes sidebar UI state that needed
 * persistence, not workspace navigation state, and a persistence
 * requirement never by itself makes `Workspace` the owner of unrelated UI
 * state.
 *
 * Zero-dependency and in-memory only, the same `Observable` shape as
 * `Workspace` — `WorkspaceSessionStore` (the persistence boundary) seeds it
 * at boot and observes it afterwards; this class never knows persistence
 * exists. Lives in `core` rather than `features/` only so that store can
 * observe it without a `core -> features` import (dependencies point
 * downward). Constructed once by the Composition Root, so the state also
 * survives `DailyNotesList` unmounting on a sidebar-tab switch (its
 * previous local `useState` reset to collapsed every time).
 */
export class DailyNotesSidebarState implements Observable {
  private _earlierExpanded = false;
  private _upcomingExpanded = false;
  private readonly listeners = new Set<ChangeListener>();

  get earlierExpanded(): boolean {
    return this._earlierExpanded;
  }

  get upcomingExpanded(): boolean {
    return this._upcomingExpanded;
  }

  setEarlierExpanded(expanded: boolean): void {
    if (this._earlierExpanded === expanded) {
      return;
    }

    this._earlierExpanded = expanded;
    this.notify();
  }

  setUpcomingExpanded(expanded: boolean): void {
    if (this._upcomingExpanded === expanded) {
      return;
    }

    this._upcomingExpanded = expanded;
    this.notify();
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
