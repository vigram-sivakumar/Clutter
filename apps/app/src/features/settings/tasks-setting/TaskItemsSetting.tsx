import { useSyncExternalStore } from 'react';
import {
  readTaskItemLimitChoice,
  subscribeTaskItemLimitChoice,
  writeTaskItemLimitChoice,
} from '@shared/helpers/taskItemLimitPreference';
import { ItemLimitSetting } from '../item-limit-setting/ItemLimitSetting';

export function TaskItemsSetting() {
  const choice = useSyncExternalStore(subscribeTaskItemLimitChoice, readTaskItemLimitChoice);

  return (
    <ItemLimitSetting
      description="Choose how many tasks to show in each section before showing more."
      choice={choice}
      onChange={writeTaskItemLimitChoice}
    />
  );
}
