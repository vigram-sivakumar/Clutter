import '../../styles/notes-panel.css';

import { notesGroups } from './NotesPanel.config';
import { ListGroup } from '../ListGroup';
import { ListItem } from '../ListItem';
import { Divider } from '../Divider';
import { Caret } from '../Caret';

export function NotesPanel() {
  return (
    <div className="notes-panel">
      {notesGroups.map((group, index) => (
        <>
          <ListGroup
            key={group.title ?? index}
            title={
              group.collapsible ? (
                <>
                  {group.title}
                  <Caret state="collapsed" type="dropdown" />
                </>
              ) : (
                group.title
              )
            }
            collapsible={group.collapsible}
          >
            {group.items.map((item) => {
              const Icon = item.icon;

              return (
                <ListItem
                  key={item.id}
                  startSlot={Icon ? <Icon /> : undefined}
                  onClick={() => {}}
                >
                  {item.label}
                </ListItem>
              );
            })}
          </ListGroup>
          {group.hasDivider && <Divider />}
        </>
      ))}
    </div>
  );
}
