import type { ReactNode } from 'react';
import { useState } from 'react';

import { SidebarTabs, type SidebarTabId } from './SidebarTabs';
import { NotesSidebar } from './NotesSidebar';

export type SidebarProps = {
  open: boolean;
  children?: ReactNode;
};

export function Sidebar(_: SidebarProps) {
  const [workspaceTab, setWorkspaceTab] = useState<SidebarTabId>('notes');

  return (
    <div className="clutter-sidebar">
      <SidebarTabs value={workspaceTab} onValueChange={setWorkspaceTab} />
      {workspaceTab === 'notes' && <NotesSidebar />}
    </div>
  );
}
