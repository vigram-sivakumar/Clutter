import { useSyncExternalStore } from 'react';
import {
  readFolderItemLimitChoice,
  subscribeFolderItemLimitChoice,
  writeFolderItemLimitChoice,
} from '@shared/helpers/folderItemLimitPreference';
import { ItemLimitSetting } from '../item-limit-setting/ItemLimitSetting';

export function FolderItemsSetting() {
  const choice = useSyncExternalStore(subscribeFolderItemLimitChoice, readFolderItemLimitChoice);

  return (
    <ItemLimitSetting
      description="Choose how many items to show in each folder before showing more"
      choice={choice}
      onChange={writeFolderItemLimitChoice}
    />
  );
}
