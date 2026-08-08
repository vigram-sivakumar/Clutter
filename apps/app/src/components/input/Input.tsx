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
      ...inputProps
    },
    ref
  ) => {
    const className = [
      'input',
      hasBackground && 'input--background',
      hasBorder && 'input--border',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={className}>
        {leading && <div className="input__leading">{leading}</div>}

        <input ref={ref} className="input__field" {...inputProps} />

        {trailing && <div className="input__trailing">{trailing}</div>}
      </div>
    );
  }
);

Input.displayName = 'Input';
