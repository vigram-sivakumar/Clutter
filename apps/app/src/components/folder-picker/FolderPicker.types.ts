export interface FolderPickerItem {
  id: string;
  title: string;
  emoji?: string | null;
  level: number;
  ancestorPath?: string;
}

export interface FolderPickerProps {
  items: FolderPickerItem[];
  onSelect: (item: FolderPickerItem) => void;
  onCreate?: (name: string) => void;
}
