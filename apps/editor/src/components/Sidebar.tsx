import type { ReactNode } from 'react';
import { useState } from 'react';

import { NotesTab } from './NotesTab';
import { TagsTab } from './TagsTab';
import { TasksTab } from './TasksTab';
import { SidebarTabs, type SidebarTabId } from './OldSidebarTabs';

export type SidebarProps = {
  open: boolean;
  children?: ReactNode;
};

export function Sidebar(_: SidebarProps) {
  const [workspaceTab, setWorkspaceTab] = useState<SidebarTabId>('notes');
  const [isPointerOver, setIsPointerOver] = useState(false);

  return (
    <div
      className={[
        'clutter-sidebar',
        isPointerOver && 'clutter-sidebar--pointer-over',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={() => setIsPointerOver(true)}
      onMouseLeave={() => setIsPointerOver(false)}
    >
      <SidebarTabs value={workspaceTab} onValueChange={setWorkspaceTab} />
      <div className="clutter-sidebar__workspace">
        {workspaceTab === 'notes' && <NotesTab />}
        {workspaceTab === 'journals' && null}
        {workspaceTab === 'tasks' && <TasksTab />}
        {workspaceTab === 'tags' && <TagsTab />}
      </div>
    </div>
  );
}
