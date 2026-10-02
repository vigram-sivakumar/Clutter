import { Checkbox } from '@components/checkbox/Checkbox';

import type { PropertyEditability } from './PropertyList.types';
import { PropertyValueCell } from './PropertyValueCell';

type CheckboxPropertyValueProps = {
  name: string;
  value: boolean;
} & PropertyEditability<boolean>;

/**
 * The `boolean` Property's value — the existing Checkbox, no input,
 * popover, or edit mode. Editable: clicking toggles and commits
 * immediately. Read-only: the same Checkbox, disabled (shows the state,
 * not interactive).
 */
export function CheckboxPropertyValue(props: CheckboxPropertyValueProps) {
  return (
    <PropertyValueCell>
      <Checkbox
        isChecked={props.value}
        disabled={!props.editable}
        onCheckedChange={props.editable ? props.onCommit : undefined}
      />
    </PropertyValueCell>
  );
}
