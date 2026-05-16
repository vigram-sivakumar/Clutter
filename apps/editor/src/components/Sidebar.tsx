import type { ReactNode } from 'react';
import { useState } from 'react';

import { NotesTab } from './NotesTab';
import { SidebarTabs, type SidebarTabId } from './SidebarTabs';

export type SidebarProps = {
  open: boolean;
  children?: ReactNode;
};

export function Sidebar(_: SidebarProps) {
  const [workspaceTab, setWorkspaceTab] = useState<SidebarTabId>('notes');

  return (
    <div className="clutter-sidebar">
      <SidebarTabs value={workspaceTab} onValueChange={setWorkspaceTab} />
      <div className="clutter-sidebar__workspace">
        {workspaceTab === 'notes' && <NotesTab />}
      </div>
    </div>
  );
}
