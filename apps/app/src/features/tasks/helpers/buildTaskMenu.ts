import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceActionSurface } from '@core/presentation/resourceActions/resourceActionSurfaces';
import type { ResourceActionHandlers } from '@core/presentation/resourceActions/resourceActionTypes';
import { formatTaskDueDate } from './formatTaskDueDate';

/**
 * A task's More actions menu — the canonical task actions (ADR-048) listing exactly the operations the caller
 * supplied. The one builder behind the sidebar row's menu and the Task Collection's right-click menu, so
 * their labels, icons, groups, order and availability can never differ.
 */
export function buildTaskMenu(
  handlers: ResourceActionHandlers,
  date: string | undefined,
  surface: ResourceActionSurface
): OverflowMenuItemConfig[] {
  return buildResourceActionMenu(
    'task',
    { executable: Object.keys(handlers), valueLabel: date ? formatTaskDueDate(date) : undefined },
    surface
  );
}
