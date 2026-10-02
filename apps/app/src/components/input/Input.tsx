import { forwardRef, useLayoutEffect, useRef } from 'react';
import type { ForwardedRef, Ref, TextareaHTMLAttributes } from 'react';

import type { InputProps } from './Input.types';
import './Input.css';

/** Assigns `node` to every ref in `refs`, function or object alike. */
function mergeRefs<T>(
  ...refs: readonly (ForwardedRef<T> | undefined)[]
): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (!ref) {
        continue;
      }

      if (typeof ref === 'function') {
        ref(node);
      } else {
        ref.current = node;
      }
    }
  };
}

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
    //
    // Icon-aware horizontal padding, same rule as Button's: the side away
    // from a leading/trailing icon — a side where text meets the edge —
    // gets 4px extra (Input.css). With both icons there's no "side away",
    // so it keeps the unmodified base padding.
    const hasLeadingOnly = Boolean(leading) && !trailing;
    const hasTrailingOnly = Boolean(trailing) && !leading;
    const hasNoIcon = !leading && !trailing;

    const wrapperClassName = [
      'input',
      hasBackground && 'input--background',
      hasBorder && 'input--border',
      multiline && 'input--multiline',
      hasLeadingOnly && 'input--has-leading',
      hasTrailingOnly && 'input--has-trailing',
      hasNoIcon && 'input--no-icon',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // Grows/shrinks a multiline field to fit its own wrapped content —
    // `rows` alone only sets the *initial* height; a <textarea> never
    // resizes itself as content wraps past it, so without this it just
    // scrolls internally instead of the field visibly growing. Resets to
    // 'auto' first so a shrink (deleting a wrapped line) is measured
    // correctly too, not just growth. Runs on every render (no dependency
    // array) rather than keying off `value` specifically, since
    // `inputProps.value` is typed as `unknown` here (shared with <input>)
    // and this is a cheap, idempotent DOM read+write either way.
    const autoGrowRef = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
      if (!multiline) {
        return;
      }

      const element = autoGrowRef.current;

      if (!element) {
        return;
      }

      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    });

    return (
      <div className={wrapperClassName}>
        {leading && <div className="input__leading">{leading}</div>}

        {multiline ? (
          <textarea
            ref={mergeRefs(ref as ForwardedRef<HTMLTextAreaElement>, autoGrowRef)}
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
