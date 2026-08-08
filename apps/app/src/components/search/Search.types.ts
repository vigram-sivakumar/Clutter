import type { InputHTMLAttributes } from 'react';

export interface SearchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  onClear?: () => void;
}
