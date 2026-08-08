import { Input } from '@components/input/Input';
import { AppIcon } from '@shared/icon';

import type { SearchProps } from './Search.types';
import './Search.css';
import { Button } from '@components/button/Button';

export function Search({ onClear, ...inputProps }: SearchProps) {
  const hasValue = Boolean(inputProps.value);

  return (
    <Input
      {...inputProps}
      type="search"
      leading={<AppIcon icon="magnifyingGlass" />}
      trailing={
        hasValue && onClear ? (
          <Button
            aria-label="Clear search"
            onClick={onClear}
            isIconOnly
            variant="ghost"
            interaction="subtle"
            size="small"
          >
            <AppIcon icon="dismiss" />
          </Button>
        ) : undefined
      }
    />
  );
}
