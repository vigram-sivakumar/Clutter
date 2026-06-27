import { FolderItem } from '../items/FolderItem';
import { NoteItem } from '../items/NoteItem';
import { TaskItem } from '../items/TaskItem';
import { useState } from 'react';

export function NotesPanel() {
  const [checked, setChecked] = useState(false);

  return (
    <div className="notes-panel">
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
    </div>
  );
}
