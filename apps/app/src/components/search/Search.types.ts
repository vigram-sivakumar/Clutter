import type { InputHTMLAttributes } from 'react';

import type { InputProps } from '@components/input/Input.types';

export interface SearchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  onClear?: () => void;
  /** The clear control: the small ghost button (default), or the round dismiss button an overlay uses to close. */
  clearButton?: 'default' | 'round';
  /** Passed straight to `Input`: both default to true. */
  hasBackground?: InputProps['hasBackground'];
  hasBorder?: InputProps['hasBorder'];
}
