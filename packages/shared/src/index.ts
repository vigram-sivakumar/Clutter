/**
 * @clutter/shared - Shared Utilities & Hooks
 *
 * Pure utilities and React hooks that are reusable across platforms.
 * Dependencies: @clutter/domain, @clutter/state
 *
 * Public API: Only exports what is consumed by >1 package.
 */

// Theme Contracts (used by editor and UI)
export type { EditorTheme, EditorThemeColors } from './theme/EditorTheme';
export { isEditorTheme } from './theme/EditorTheme';

// Utils: Date formatting (used by UI components)
export {
  getTodayDateString,
  formatTaskDateLabel,
  compareDates,
  formatDateTime,
  formatDateWithRelative,
  MONTH_NAMES,
} from './utils/dateFormatting';

// Utils: Sorting (used by UI components)
export { sortByOrder } from './utils/sorting';

// Utils: Task extraction and manipulation (used by UI components)
export { extractTasksFromNote, toggleTaskInNote } from './utils/taskExtraction';
export type { Task } from './utils/taskExtraction';

// Utils: Task categorization (SINGLE SOURCE OF TRUTH for filtering)
export {
  categorizeTasks,
  sortTasksByDateAndCreation,
  sortTasksByCreation,
  groupTasksByDate,
} from './utils/taskCategorization';
export type { CategorizedTasks } from './utils/taskCategorization';

// Hooks (used by UI components)
export { useTheme } from './hooks/useTheme';
export { useConfirmation } from './hooks/useConfirmation';

// Re-export ConfirmationAction type for use in components
export type { ConfirmationAction } from '@clutter/state';
