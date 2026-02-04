/**
 * Checklist Block Schema
 *
 * Defines the property shape and defaults for Checklist blocks.
 * A Checklist is a task/todo block with a checkbox state.
 *
 * Future evolution:
 * - v2: dueDate, priority, assignee
 * - v3: recurring tasks
 */

export interface ChecklistBlockProperties {
  /** Whether the checklist item is checked */
  checked: boolean;
}

/**
 * Default properties when creating a new Checklist block
 */
export const CHECKLIST_BLOCK_DEFAULTS: ChecklistBlockProperties = {
  checked: false, // Unchecked by default
};
