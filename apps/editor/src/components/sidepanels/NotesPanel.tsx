import { useState } from 'react';

import { FolderItem } from '../items/FolderItem';
import { NoteItem } from '../items/NoteItem';
import { TaskItem } from '../items/TaskItem';
import { TagItem } from '../items/TagItem';
import { SectionHeader } from '../items/SectionHeader';
import { DailyNote } from '../items/DailyNoteItem';

export function NotesPanel() {
  const [checked, setChecked] = useState(false);

  return (
    <div className="notes-panel">
      <SectionHeader
        title="All object items"
        isCollapsible
        onClick={() => {}}
      />
      <FolderItem title="Folder" onClick={() => {}} />
      <NoteItem
        title="Folder is here and it will stretch so longsss"
        onClick={() => {}}
      />
      <TaskItem
        title="Task is here and it will stretch so longsss"
        checked={checked}
        onCheckedChange={setChecked}
        onClick={() => {}}
        isEmpty
      />
      <TagItem title="Finance" count={11} color="purple" onClick={() => {}} />
      <DailyNote title="Meeting with the PO" />
    </div>
  );
}
