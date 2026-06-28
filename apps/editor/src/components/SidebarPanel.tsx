import type { ReactNode } from 'react';
import { useState } from 'react';

import { Divider } from './Divider';
import '../styles/sidebar-panel.css';
import { ListItem } from './items/ListItem';
import { Icons } from '../design-system/icons';
import { CaretSlot } from './Caret';
import { Button } from './Button';

type SidebarPanelProps = {
  navigation?: ReactNode;
  children?: ReactNode;
};

export function SidebarPanel({ navigation, children }: SidebarPanelProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="clutter-sidebar-panel">
      <div className="clutter-sidebar-panel__navigation">{navigation}</div>
      <ListItem
        startSlot={
          <>
            <CaretSlot
              hasCaret
              isDisabled
              isExpanded={expanded}
              onClick={() => setExpanded(!expanded)}
            ></CaretSlot>
            <Icons.Note />
          </>
        }
        label="Users"
        endSlot={
          <Button
            variant="ghost"
            size="xsmall"
            iconOnly={Icons.MoreHorizontal}
          ></Button>
        }
      />
      <ListItem
        label={
          <>
            Users
            <CaretSlot
              side="end"
              hasCaret
              isExpanded={expanded}
              onClick={() => setExpanded(!expanded)}
            ></CaretSlot>
          </>
        }
        labelStyle="label"
      />
      <Divider />

      <div className="clutter-sidebar-panel__content">{children}</div>
    </div>
  );
}
