import React from 'react';
import { CustomIcons } from '../../design-system/icons';
import { Button } from '../Button';
import { Caret } from '../Caret';
import { ListItem } from '../ListItem';

interface FolderItemProps {
  isExpanded?: boolean;
  isEmpty?: boolean;
  title?: string;
  onClick?: () => void;
}

export function FolderItem({
  isExpanded = false,
  isEmpty = false,
  title,
  onClick,
}: FolderItemProps) {
  const caretState = isEmpty
    ? 'disabled'
    : isExpanded
      ? 'expanded'
      : 'collapsed';
  return (
    <ListItem
      onClick={onClick}
      startSlot={
        <>
          <Caret state={caretState} type="tree" />
          <CustomIcons.Folder />
        </>
      }
      endSlot={
        <>
          <Button size="small" variant="ghost" isIconOnly></Button>
        </>
      }
    >
      {title}
    </ListItem>
  );
}
