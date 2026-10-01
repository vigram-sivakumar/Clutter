import { forwardRef } from 'react';
import type { Ref, TextareaHTMLAttributes } from 'react';

import type { InputProps } from './Input.types';
import './Input.css';

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  (
    {
      leading,
      trailing,
      hasBackground = true,
      hasBorder = true,
      multiline = false,
      className,
      ...inputProps
    },
    ref
  ) => {
    // Applied to the wrapper, not the native field — pulled out of
    // inputProps so a caller's className can't silently clobber the
    // "input__field" class the inner field needs for its own styling.
    const wrapperClassName = [
      'input',
      hasBackground && 'input--background',
      hasBorder && 'input--border',
      multiline && 'input--multiline',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClassName}>
        {leading && <div className="input__leading">{leading}</div>}

        {multiline ? (
          <textarea
            ref={ref as Ref<HTMLTextAreaElement>}
            className="input__field"
            rows={3}
            // InputHTMLAttributes and TextareaHTMLAttributes share every
            // prop an actual caller passes here (value, placeholder,
            // autoFocus, disabled, onChange, onKeyDown, ...) — the only
            // input-only members (type, size, list, ...) are never set by
            // a multiline caller in practice, so this is a safe, narrow
            // cast rather than a second parallel prop type.
            {...(inputProps as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input ref={ref as Ref<HTMLInputElement>} className="input__field" {...inputProps} />
        )}

        {trailing && <div className="input__trailing">{trailing}</div>}
      </div>
    );
  }
);

Input.displayName = 'Input';
