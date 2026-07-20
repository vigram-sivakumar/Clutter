import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import type { EditableTextProps, EditableTextRef } from './EditableText.types';

import './EditableText.css';

function updateEmptyState(element: HTMLDivElement | null) {
  if (!element) {
    return;
  }

  element.dataset.empty = String((element.textContent ?? '').trim() === '');
}

function updateTextContent(element: HTMLDivElement | null, value: string) {
  if (!element) {
    return;
  }

  if (element.textContent !== value) {
    element.textContent = value;
  }

  updateEmptyState(element);
}

export const EditableText = forwardRef<EditableTextRef, EditableTextProps>(
  function EditableText(
    {
      value,
      placeholder,
      editTrigger = 'click',
      isDisabled = false,
      onCommit,
      className,
      onClick,
      onDoubleClick,
      ...props
    },
    ref
  ) {
    const editableElementRef = useRef<HTMLDivElement>(null);
    const isEditingRef = useRef(false);
    const isFinishingRef = useRef(false);
    const isComposingRef = useRef(false);

    const [isEditing, setIsEditingState] = useState(false);

    function normalizeValue(nextValue: string) {
      return nextValue.trim();
    }

    function setEditing(nextIsEditing: boolean) {
      isEditingRef.current = nextIsEditing;
      setIsEditingState(nextIsEditing);
    }

    function beginEditing() {
      if (isDisabled || isEditingRef.current) {
        return;
      }

      isFinishingRef.current = false;
      setEditing(true);
    }

    function commitEditing() {
      if (!isEditingRef.current || isFinishingRef.current) {
        return;
      }

      const editableElement = editableElementRef.current;

      if (!editableElement) {
        return;
      }

      isFinishingRef.current = true;

      const committedValue = normalizeValue(editableElement.textContent ?? '');

      updateTextContent(editableElement, committedValue);
      setEditing(false);
      onCommit(committedValue);
    }

    useEffect(() => {
      if (!isEditing) {
        return;
      }

      editableElementRef.current?.focus();
    }, [isEditing]);

    useLayoutEffect(() => {
      if (isEditingRef.current) {
        return;
      }

      updateTextContent(editableElementRef.current, value);
    }, [value]);

    function handleClick(event: MouseEvent<HTMLDivElement>) {
      onClick?.(event);

      if (!event.defaultPrevented && editTrigger === 'click') {
        beginEditing();
      }
    }

    function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
      onDoubleClick?.(event);

      if (!event.defaultPrevented && editTrigger === 'doubleClick') {
        beginEditing();
      }
    }

    function handleInput(_event: FormEvent<HTMLDivElement>) {
      updateEmptyState(editableElementRef.current);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (
        !isEditingRef.current ||
        isComposingRef.current ||
        event.nativeEvent.isComposing
      ) {
        return;
      }

      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        commitEditing();
      }
    }

    function handleBlur() {
      commitEditing();
    }

    function handleCompositionStart(_event: CompositionEvent<HTMLDivElement>) {
      isComposingRef.current = true;
    }

    function handleCompositionEnd(_event: CompositionEvent<HTMLDivElement>) {
      isComposingRef.current = false;
    }

    useImperativeHandle(ref, () => ({
      begin: beginEditing,
      commit: commitEditing,
    }));

    return (
      <div
        {...props}
        ref={editableElementRef}
        className={['editable-text', className].filter(Boolean).join(' ')}
        contentEditable={isEditing}
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-disabled={isDisabled}
        data-placeholder={placeholder}
        tabIndex={isDisabled ? -1 : 0}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    );
  }
);
