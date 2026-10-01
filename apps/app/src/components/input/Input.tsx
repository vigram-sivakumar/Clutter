import { forwardRef } from 'react';

import type { InputProps } from './Input.types';
import './Input.css';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      leading,
      trailing,
      hasBackground = true,
      hasBorder = true,
      className,
      ...inputProps
    },
    ref
  ) => {
    // Applied to the wrapper, not the native <input> — pulled out of
    // inputProps so a caller's className can't silently clobber the
    // "input__field" class the inner <input> needs for its own styling.
    const wrapperClassName = [
      'input',
      hasBackground && 'input--background',
      hasBorder && 'input--border',
      className,
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={wrapperClassName}>
        {leading && <div className="input__leading">{leading}</div>}

        <input ref={ref} className="input__field" {...inputProps} />

        {trailing && <div className="input__trailing">{trailing}</div>}
      </div>
    );
  }
);

Input.displayName = 'Input';
