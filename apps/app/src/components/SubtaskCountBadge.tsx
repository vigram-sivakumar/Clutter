import '../design-system/styles/subtask-count-badge.css';

export type SubtaskCountBadgeProps = {
  completed: number;
  total: number;
  className?: string;
};

export function SubtaskCountBadge({
  completed,
  total,
  className,
}: SubtaskCountBadgeProps) {
  if (total <= 0) {
    return null;
  }

  const safeCompleted = Math.min(Math.max(0, completed), total);

  return (
    <span
      className={['clutter-subtask-count-badge', className]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${safeCompleted} of ${total} subtasks complete`}
    >
      {safeCompleted}/{total}
    </span>
  );
}
