// import { useState } from 'react';
import { Section } from '../Section';

import { NoteItem } from '../items/NoteItem';
import { FolderItem } from '../items/FolderItem';

export function NotesPanel() {
  // const [checked, setChecked] = useState(false);

  return (
    <div className="notes-panel">
      <Section title="Folders" expanded={true} onExpandedChange={() => {}}>
        <FolderItem title="Work" isEmpty onClick={() => {}} />
        <FolderItem title="Projects" isEmpty onClick={() => {}} />
        <NoteItem title="Meeting Notes" onClick={() => {}} />
      </Section>
    </div>
  );
}
