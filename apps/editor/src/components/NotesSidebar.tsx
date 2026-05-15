import { SidebarPanel } from './SidebarPanel';
import { SidebarSection } from './SidebarSection';
import { InteractiveItem } from './InteractiveItem';
import { Button } from './Button';
import { CustomIcons as Icons } from '../design-system/icons';

export function NotesSidebar() {
  return (
    <SidebarPanel
      header={
        <SidebarSection>
          <InteractiveItem
            interactive={false}
            hasEndSlot={true}
            className="interactive-item--header"
            // endSlot={
            //   <>
            //     {/*  Create new notes button */}
            //     <Button
            //       variant="ghost"
            //       size="small"
            //       iconOnly={Icons.NotePencil}
            //     />
            //     {/* Create new folder button */}
            //     <Button
            //       variant="ghost"
            //       size="small"
            //       iconOnly={Icons.FolderAdd}
            //     />
            //   </>
            // }
          >
            <span className="interactive-item__header">Notes</span>
          </InteractiveItem>
          <InteractiveItem hasStartSlot={true} startSlot={<Icons.Note />}>
            <span className="interactive-item__label">All Notes</span>
          </InteractiveItem>

          <InteractiveItem hasStartSlot={true} startSlot={<Icons.Template />}>
            <span className="interactive-item__label">Templates</span>
          </InteractiveItem>

          <InteractiveItem hasStartSlot={true} startSlot={<Icons.Tray />}>
            <span className="interactive-item__label">Inbox</span>
          </InteractiveItem>
        </SidebarSection>
      }
    >
      <SidebarSection>
        <InteractiveItem
          className="interactive-item--header"
          hasEndSlot={true}
          endSlot={
            <>
              <Button
                variant="ghost"
                size="xsmall"
                iconOnly={Icons.ChevronDown}
              />
            </>
          }
        >
          <span className="interactive-item__header">Favorites</span>
        </InteractiveItem>
        <InteractiveItem
          interactive={false}
          className="interactive-item--placeholder"
        >
          <span className="interactive-item__placeholder">
            Star notes or folders to see them here. Star notes or folders to see
            them here
          </span>
        </InteractiveItem>
      </SidebarSection>

      <SidebarSection>
        <InteractiveItem
          className="interactive-item--header"
          hasEndSlot={true}
          endSlot={
            <>
              <Button
                variant="ghost"
                size="xsmall"
                iconOnly={Icons.ChevronDown}
              />
            </>
          }
        >
          <span className="interactive-item__header">All folders</span>
        </InteractiveItem>
        <InteractiveItem
          interactive={false}
          className="interactive-item--placeholder"
        >
          <span className="interactive-item__placeholder">No folders yet </span>
        </InteractiveItem>
      </SidebarSection>
    </SidebarPanel>
  );
}
