import { useState } from 'react';

import { Section } from '../Section';
import { Note } from '../entry/Entry.Note';
import { Folder } from '../entry/Entry.Folder';
import { Button } from '../Button';
import { Icons } from '../../design-system/icons';
import { Navigation } from '../entry/Entry.Navigation';
import { Divider } from '../Divider';

export function Notes() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="notes-panel">
      <section title="Notes">
        <Navigation
          title="All Notes"
          leading={<Icons.Note />}
          onClick={() => {}}
        />
        <Navigation title="Inbox" leading={<Icons.Tray />} onClick={() => {}} />
        <Navigation
          title="Templates"
          leading={<Icons.Template />}
          onClick={() => {}}
        />
      </section>
      <Divider />
      <Section
        title="Folders"
        actions={
          <Button isIconOnly size="small" variant="ghost">
            <Icons.Plus />
          </Button>
        }
        isExpanded={expanded}
        onExpandedChange={setExpanded}
        onClick={() => {}}
      >
        <Folder title="Work" onClick={() => {}} />
        <Folder title="Projects" isEmpty onClick={() => {}} />
        <Note title="Meeting Notes" onClick={() => {}} />
      </Section>
    </div>
  );
}
