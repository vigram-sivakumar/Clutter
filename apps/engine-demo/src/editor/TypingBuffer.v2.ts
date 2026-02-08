/**
 * 🔒 TYPING BUFFER — Instance-Based (NO SINGLETONS)
 * 
 * CRITICAL ARCHITECTURAL CHANGE:
 * - Each NodeEditor creates its OWN TypingBuffer instance
 * - Bound to specific EditorModel instance
 * - No global state
 * - No shared module-level variables
 * - Multi-document isolation GUARANTEED
 */

import type { Segment } from '../engine/NodeKernel';
import type { CursorPosition } from '../engine/NodeKernel';

/**
 * TypingBuffer Class (Instance-Based)
 */
export class TypingBuffer {
  private isTypingFlag: boolean = false;
  private pendingSegments: Map<string, Segment[]> = new Map();
  private liveCursor: CursorPosition | null = null;
  private debounceTimer: number | null = null;
  private debounceInProgress: boolean = false;
  private readonly instanceId: string;

  constructor() {
    this.instanceId = `typing-${Math.random().toString(36).slice(2, 11)}`;

    if (__DEV__) {
      console.log(`⌨️ TypingBuffer created: ${this.instanceId}`);
    }
  }

  /**
   * Check if typing is active
   */
  isTyping(): boolean {
    return this.isTypingFlag;
  }

  /**
   * Start typing flag
   */
  startTyping(): void {
    this.isTypingFlag = true;
  }

  /**
   * Stop typing flag
   */
  stopTyping(): void {
    this.isTypingFlag = false;
    this.stopDebounceFlush();
  }

  /**
   * Check if node has pending changes
   */
  hasPendingChanges(nodeId: string): boolean {
    return this.pendingSegments.has(nodeId);
  }

  /**
   * Get pending segments for node
   */
  getPendingSegments(nodeId: string): Segment[] | undefined {
    return this.pendingSegments.get(nodeId);
  }

  /**
   * Set pending segments for node
   */
  setPendingSegments(nodeId: string, segments: Segment[]): void {
    this.pendingSegments.set(nodeId, segments);
  }

  /**
   * Get all node IDs with pending changes
   */
  getAllPendingNodeIds(): string[] {
    return Array.from(this.pendingSegments.keys());
  }

  /**
   * Clear pending segments for specific node
   */
  clearPendingSegments(nodeId: string): void {
    this.pendingSegments.delete(nodeId);
  }

  /**
   * Clear all pending segments
   */
  clearAllPendingSegments(): void {
    this.pendingSegments.clear();
  }

  /**
   * Set live cursor (during typing)
   */
  setLiveCursor(cursor: CursorPosition): void {
    this.liveCursor = cursor;
  }

  /**
   * Get live cursor
   */
  getLiveCursor(): CursorPosition | null {
    return this.liveCursor;
  }

  /**
   * Clear live cursor
   */
  clearLiveCursor(): void {
    this.liveCursor = null;
  }

  /**
   * Start debounce flush timer
   */
  startDebounceFlush(callback: () => void, delay: number = 500): void {
    this.stopDebounceFlush();
    
    this.debounceTimer = window.setTimeout(() => {
      this.debounceInProgress = true;
      
      try {
        callback();
      } finally {
        this.debounceInProgress = false;
        this.debounceTimer = null;
      }
    }, delay);
  }

  /**
   * Stop debounce flush timer
   */
  stopDebounceFlush(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.debounceInProgress = false;
  }

  /**
   * Check if debounce flush is in progress
   */
  isDebounceFlush(): boolean {
    return this.debounceInProgress;
  }

  /**
   * Get instance ID (for debugging)
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Destroy instance (cleanup)
   */
  destroy(): void {
    this.stopDebounceFlush();
    this.pendingSegments.clear();
    this.liveCursor = null;

    if (__DEV__) {
      console.log(`⌨️ TypingBuffer destroyed: ${this.instanceId}`);
    }
  }
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
