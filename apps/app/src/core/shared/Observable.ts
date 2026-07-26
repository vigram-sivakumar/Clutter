/**
 * Listener invoked when an observable object changes.
 */
export type ChangeListener = () => void;

/**
 * Minimal observable contract used by long-lived core objects.
 *
 * The core remains framework-agnostic. Consumers (React, Tauri,
 * tests, plugins, etc.) subscribe to changes without introducing
 * framework-specific dependencies into the domain layer.
 */
export interface Observable {
  /**
   * Registers a listener.
   *
   * Returns a function that unsubscribes the listener.
   */
  subscribe(listener: ChangeListener): () => void;
}
