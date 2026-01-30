/**
 * KeyboardEngine - Rule executor and intent router
 *
 * Takes a set of rules and evaluates them in priority order.
 * Rules emit intents, which are routed through IntentResolver.
 *
 * This is the only place where rules are actually evaluated.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SELECTION MODEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ProseMirror owns selection state:
 *   - TextSelection for text editing and ranges
 *   - NodeSelection for structural block selection (shows halo)
 *   - AllSelection for document-wide selection (Ctrl+A final state)
 *
 * Keyboard rules operate on PM selection state directly.
 * Visual halos are rendered based on PM selection type.
 *
 * This matches modern note-taking apps (Craft, Notion, Workflowy).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { Editor } from '@tiptap/core';
import type { KeyboardRule } from '../types/KeyboardRule';
import type { KeyboardContext } from '../types/KeyboardContext';
import { createKeyboardContext } from '../types/KeyboardContext';
import type { KeyHandlingResult } from '../types/KeyHandlingResult';
import { handled, notHandled } from '../types/KeyHandlingResult';

/**
 * KeyboardEngine - Evaluates rules and executes commands
 */
export class KeyboardEngine {
  private rules: KeyboardRule[] = [];

  constructor(rules: KeyboardRule[] = []) {
    this.setRules(rules);
  }

  /**
   * Set rules (automatically sorts by priority)
   */
  setRules(rules: KeyboardRule[]): void {
    this.rules = [...rules].sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA; // Higher priority first
    });
  }

  /**
   * Add a rule
   */
  addRule(rule: KeyboardRule): void {
    this.setRules([...this.rules, rule]);
  }

  /**
   * Handle a key press
   *
   * OWNERSHIP CONTRACT:
   * - If handled: true → preventDefault + stopPropagation MUST be called by caller
   * - If handled: false → let ProseMirror/browser handle it
   *
   * CRITICAL: If an intent is emitted (even if it fails), key is ALWAYS handled.
   * This prevents state corruption from double-handling.
   */
  handle(editor: Editor, key: KeyboardContext['key']): KeyHandlingResult {
    const ctx = createKeyboardContext(editor, key);

    for (const rule of this.rules) {
      // Check if rule applies

      if (!rule.when(ctx)) {
        continue;
      }

      // Execute rule - can return intent(s) or boolean (legacy)
      const result = rule.execute(ctx);

      // Handle legacy boolean return (for backwards compatibility during transition)
      if (typeof result === 'boolean') {
        if (result) {
          if (rule.stopPropagation !== false) {
            return handled(undefined, `Legacy rule: ${rule.id}`);
          }
        }
        continue;
      }

      // Handle intent-based return
      if (!result) {
        continue;
      }

      // Normalize to array of intents
      const intents = Array.isArray(result) ? result : [result];

      // Route intents through resolver
      let allSucceeded = true;
      let failureReason: string | undefined;

      for (const intent of intents) {
        if (this.resolver) {
          // NEW: Route through IntentResolver
          const intentResult = this.resolver.resolve(intent);

          if (!intentResult.success) {
            allSucceeded = false;
            failureReason = intentResult.reason;
          }
        } else {
          // NO RESOLVER: Log warning but continue
          allSucceeded = false;
          failureReason = 'No resolver available';
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🔑 INTENT RESULT HANDLING (CRITICAL FOR UX)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //
      // If intent SUCCEEDED → consume key (preventDefault)
      // If intent FAILED:
      //   - Structural intents → STILL consume key (no fallback)
      //   - Text intents → allow fallback (let browser/PM handle key)
      //
      // 🔒 STRUCTURAL INTENT LAW (Apple-level behavior):
      // Structural keys (Tab, Shift+Tab, structural Enter/Backspace)
      // must NEVER fall back to browser/PM, even when intent fails.
      //
      // Why: PM fallback on Tab causes:
      //   - Focus to leave editor
      //   - Cursor to disappear
      //   - Selection to drift
      //
      // This matches modern note-taking apps (Craft, Notion, Workflowy).
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (intents.length > 0) {
        if (allSucceeded) {
          if (rule.stopPropagation !== false) {
            return handled(intents[0].type, 'Success');
          }
        } else {
          // 🔒 Check if this is a structural intent
          const firstIntent = intents[0];
          const isStructuralIntent = [
            'indent-block',
            'outdent-block',
            'delete-block',
            'merge-blocks',
            'split-block',
            'convert-block',
            'move-block',
            'toggle-collapse',
          ].includes(firstIntent.type);

          if (isStructuralIntent) {
            // 🔒 STRUCTURAL INTENT: Consume key even on failure

            return handled(
              firstIntent.type,
              `Structural intent blocked: ${failureReason || 'Intent failed'}`
            );
          } else {
            // 🔁 TEXT INTENT: Allow fallback

            return notHandled(failureReason || 'Intent failed');
          }
        }
      }
    }

    return notHandled('No matching rule');
  }

  /**
   * Get all registered rules (for debugging)
   */
  getRules(): ReadonlyArray<KeyboardRule> {
    return this.rules;
  }
}

/**
 * Create a keyboard engine with rules
 */
export function createKeyboardEngine(rules: KeyboardRule[]): KeyboardEngine {
  return new KeyboardEngine(rules);
}
