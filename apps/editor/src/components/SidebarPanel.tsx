import type { ReactNode } from 'react';

import { Divider } from './Divider';
import '../styles/sidebar-panel.css';
import { ListItem } from './ListItem';
import { CustomIcons, ICON_SMALL } from '../design-system/icons';
import { CaretSlot } from './TreeCaret';

type SidebarPanelProps = {
  navigation?: ReactNode;
  children?: ReactNode;
};

export function SidebarPanel({ navigation, children }: SidebarPanelProps) {
  return (
    <div className="clutter-sidebar-panel">
      <div className="clutter-sidebar-panel__navigation">{navigation}</div>
      <ListItem
        startSlot={
          <>
            <CaretSlot>
              <CustomIcons.CaretRight size={ICON_SMALL} />
            </CaretSlot>
            <CustomIcons.Note />
          </>
        }
        label="Users"
        endSlot={<CustomIcons.Folder />}
      />
      <ListItem
        label={
          <>
            Users
            <CaretSlot side="end">
              <CustomIcons.CaretDown size={ICON_SMALL} />
            </CaretSlot>
          </>
        }
        labelStyle="label"
      />
      <Divider />

      <div className="clutter-sidebar-panel__content">{children}</div>
    </div>
  );
}
