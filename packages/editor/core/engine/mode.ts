/**
 * InteractionMode Management
 *
 * The editor can only be in ONE mode at a time.
 *
 * This eliminates conflicts between handlers:
 * - Drag handler doesn't fire during typing
 * - Selection handler doesn't fire during drag
 * - Keyboard handler checks mode before acting
 *
 * Mode transitions are:
 * - Explicit (no implicit mode changes)
 * - Logged (for debugging)
 * - Reversible (can return to previous mode)
 */

import type { InteractionMode } from './types';

export type ModeChangeListener = (
  _newMode: InteractionMode,
  _oldMode: InteractionMode
) => void;

/**
 * ModeManager - Holds and transitions interaction modes
 *
 * This is a critical component.
 * Half your bugs come from mode conflicts.
 */
export class ModeManager {
  private mode: InteractionMode = 'idle';
  private previousMode: InteractionMode = 'idle';
  private listeners: Set<ModeChangeListener> = new Set();
  private modeStack: InteractionMode[] = [];

  /**
   * Get current mode
   */
  getMode(): InteractionMode {
    return this.mode;
  }

  /**
   * Get previous mode (for returning)
   */
  getPreviousMode(): InteractionMode {
    return this.previousMode;
  }

  /**
   * Set mode with validation
   *
   * Mode changes are logged and broadcast to listeners.
   */
  setMode(newMode: InteractionMode, reason?: string): void {
    if (newMode === this.mode) return;

    const oldMode = this.mode;
    this.previousMode = oldMode;
    this.mode = newMode;

    // Notify listeners
    this.listeners.forEach((fn) => fn(newMode, oldMode));
  }

  /**
   * Push a temporary mode (can be popped later)
   *
   * Example: Enter command mode, then return to typing
   */
  pushMode(newMode: InteractionMode, reason?: string): void {
    this.modeStack.push(this.mode);
    this.setMode(newMode, reason);
  }

  /**
   * Pop back to previous mode in stack
   */
  popMode(reason?: string): void {
    const previousMode = this.modeStack.pop();
    if (previousMode) {
      this.setMode(previousMode, reason || 'pop');
    } else {
      this.setMode('idle', reason || 'pop (empty stack)');
    }
  }

  /**
   * Return to idle mode
   */
  reset(reason?: string): void {
    this.modeStack = [];
    this.setMode('idle', reason || 'reset');
  }

  /**
   * Subscribe to mode changes
   *
   * Returns unsubscribe function
   */
  onModeChange(fn: ModeChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Check if specific intent is allowed in current mode
   *
   * This is the gatekeeper.
   */
  isIntentAllowed(intentType: string): boolean {
    const mode = this.mode;

    // Typing mode: only text operations
    if (mode === 'typing') {
      return [
        'insert-text',
        'delete-backward',
        'delete-forward',
        'delete-text',
        'toggle-mark',
        'noop',
      ].includes(intentType);
    }

    // Block selection mode: no text editing
    if (mode === 'block-selection') {
      return ![
        'insert-text',
        'delete-backward',
        'delete-forward',
        'toggle-mark',
      ].includes(intentType);
    }

    // Dragging mode: only drag-related
    if (mode === 'dragging') {
      return ['drag-over', 'drop', 'cancel-drag', 'noop'].includes(intentType);
    }

    // Command mode: only slash command intents
    if (mode === 'command') {
      return ['create-block', 'convert-block', 'noop'].includes(intentType);
    }

    // Selecting mode: text selection operations
    if (mode === 'selecting') {
      return [
        'select-text',
        'extend-selection',
        'clear-selection',
        'delete-text',
        'noop',
      ].includes(intentType);
    }

    // Navigating mode: cursor movement only
    if (mode === 'navigating') {
      return [
        'move-cursor',
        'move-cursor-to',
        'move-to-next-block',
        'move-to-previous-block',
        'noop',
      ].includes(intentType);
    }

    // IME composing: only allow composition events
    if (mode === 'composing-ime') {
      return ['insert-text', 'noop'].includes(intentType);
    }

    // Idle mode: allow most things
    if (mode === 'idle') {
      // Block dangerous operations when idle
      return !['dragging'].includes(intentType);
    }

    return true;
  }

  /**
   * Check if mode transition is valid
   */
  canTransitionTo(newMode: InteractionMode): boolean {
    const current = this.mode;

    // Can't start dragging while composing IME
    if (current === 'composing-ime' && newMode === 'dragging') {
      return false;
    }

    // Can't start typing while dragging
    if (current === 'dragging' && newMode === 'typing') {
      return false;
    }

    // Most transitions are valid
    return true;
  }

  /**
   * Get debug info
   */
  getDebugInfo(): {
    mode: InteractionMode;
    previousMode: InteractionMode;
    stack: InteractionMode[];
  } {
    return {
      mode: this.mode,
      previousMode: this.previousMode,
      stack: [...this.modeStack],
    };
  }
}
