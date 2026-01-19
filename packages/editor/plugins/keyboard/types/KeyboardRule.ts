/**
 * KeyboardRule - A single keyboard behavior policy
 *
 * Each rule answers three questions:
 * 1. When does this apply? (when)
 * 2. What should happen? (execute)
 * 3. Should we stop? (stopPropagation)
 *
 * Rules are:
 * - Pure (no side effects in when())
 * - Explicit (clear intent)
 * - Composable (can be ordered)
 * - Testable (easy to mock context)
 */

import type { KeyboardContext } from './KeyboardContext';

/**
 * KeyboardRule interface
 *
 * Rules are evaluated in order. First rule that returns true from when()
 * and successfully executes wins.
 */
export interface KeyboardRule {
  /** Unique identifier for this rule */
  readonly id: string;

  /** Human-readable description (for debugging) */
  readonly description: string;

  /** Priority (higher = earlier evaluation, default 0) */
  readonly priority?: number;

  /**
   * Should this rule apply?
   *
   * This must be PURE - no side effects, no mutations.
   * Only inspect context and return boolean.
   *
   * @param _ctx - Immutable keyboard context
   * @returns true if rule should execute
   */
  when(_ctx: KeyboardContext): boolean;

  /**
   * Execute the rule
   *
   * Executes TipTap commands directly via ctx.editor.chain()
   *
   * @param _ctx - Immutable keyboard context
   * @returns boolean indicating if the rule was handled successfully
   */
  execute(_ctx: KeyboardContext): boolean;

  /**
   * Should we stop checking more rules after this one?
   *
   * Default: true (most rules are terminal)
   * Set to false for rules that should allow fallthrough
   */
  readonly stopPropagation?: boolean;
}

/**
 * Helper to create a keyboard rule
 */
export function defineRule(rule: KeyboardRule): KeyboardRule {
  return {
    stopPropagation: true, // Default to stopping
    priority: 0, // Default priority
    ...rule,
  };
}
