import type { HTMLAttributes } from 'react';

import { Button } from '../Button';
import { Icons } from '../../design-system/icons';

export type SidepanelTitleVariant = 'daily-notes' | 'notes' | 'tasks' | 'tags';

export type SidepanelTitleProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  variant: SidepanelTitleVariant;
  onDailyNotesMoreClick?: () => void;
  onNotesNewClick?: () => void;
  onNotesNewFolderClick?: () => void;
  onNotesMoreClick?: () => void;
  onTasksAddClick?: () => void;
  onTasksMoreClick?: () => void;
  onTagsAddClick?: () => void;
  onTagsMoreClick?: () => void;
};

const LABELS: Record<SidepanelTitleVariant, string> = {
  'daily-notes': 'Daily Notes',
  notes: 'Notes',
  tasks: 'Tasks',
  tags: 'Tags',
};

/**
 * Side panel section header — Figma SidepanelTitle (node 183:9281).
 * Month/year + calendar nav live in the calendar content block, not here.
 */
export function SidepanelTitle({
  variant,
  onDailyNotesMoreClick,
  onNotesNewClick,
  onNotesNewFolderClick,
  onNotesMoreClick,
  onTasksAddClick,
  onTasksMoreClick,
  onTagsAddClick,
  onTagsMoreClick,
  className,
  ...divProps
}: SidepanelTitleProps) {
  const rootCls = ['clutter-sidepanel-title', className].filter(Boolean).join(' ');

  return (
    <div className={rootCls} {...divProps}>
      <div className="clutter-sidepanel-title__label-wrap">
        <p className="clutter-sidepanel-title__label">{LABELS[variant]}</p>
      </div>
      <div
        className="clutter-sidepanel-title__actions"
        data-density={variant === 'daily-notes' ? 'compact' : undefined}
      >
        {variant === 'daily-notes' && (
          <Button
            type="button"
            variant="ghost"
            size="small"
            iconOnly={Icons.DotsThree}
            iconWeight="bold"
            className="clutter-sidepanel-title__action"
            aria-label="More options"
            onClick={onDailyNotesMoreClick}
          />
        )}
        {variant === 'notes' && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="small"
              iconOnly={Icons.NotePencil}
              className="clutter-sidepanel-title__action"
              aria-label="New note"
              onClick={onNotesNewClick}
            />
            <Button
              type="button"
              variant="ghost"
              size="small"
              iconOnly={Icons.FolderPlus}
              className="clutter-sidepanel-title__action"
              aria-label="New folder"
              onClick={onNotesNewFolderClick}
            />
            <Button
              type="button"
              variant="ghost"
              size="small"
              iconOnly={Icons.DotsThree}
              iconWeight="bold"
              className="clutter-sidepanel-title__action"
              aria-label="More options"
              onClick={onNotesMoreClick}
            />
          </>
        )}
        {(variant === 'tasks' || variant === 'tags') && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="small"
              iconOnly={Icons.Plus}
              className="clutter-sidepanel-title__action"
              aria-label={variant === 'tasks' ? 'Add task' : 'Add tag'}
              onClick={variant === 'tasks' ? onTasksAddClick : onTagsAddClick}
            />
            <Button
              type="button"
              variant="ghost"
              size="small"
              iconOnly={Icons.DotsThree}
              iconWeight="bold"
              className="clutter-sidepanel-title__action"
              aria-label="More options"
              onClick={variant === 'tasks' ? onTasksMoreClick : onTagsMoreClick}
            />
          </>
        )}
      </div>
    </div>
  );
}
