import { forwardRef } from 'react';

import { Input } from '@components/input/Input';
import { AppIcon } from '@shared/icon';

import type { SearchProps } from './Search.types';
import './Search.css';
import { Button } from '@components/button/Button';

// forwardRef so a caller can focus the underlying <input> imperatively
// (e.g. FolderPicker autofocusing search when it opens) — the same
// ref-forwarding Input itself already does; Search previously stopped
// that forwarding chain by being a plain function component.
export const Search = forwardRef<HTMLInputElement, SearchProps>(
  function Search({ onClear, ...inputProps }, ref) {
    const hasValue = Boolean(inputProps.value);

    return (
      <Input
        {...inputProps}
        ref={ref}
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
);
