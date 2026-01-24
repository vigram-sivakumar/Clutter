import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { useTagSuggestions, useAllTags } from '@clutter/state';
import { useTheme } from '../../../../../hooks/useTheme';
import { radius } from '../../../../../tokens/radius';
import { TagAutosuggestion } from './TagAutosuggestion';

interface TagInputProps {
  onAddTag: (tag: string) => void;
  existingTags: string[];
  placeholder?: string;
  onCancel?: () => void;
  initialValue?: string;
}

export const TagInput = ({ onAddTag, existingTags, placeholder = 'Add tag...', onCancel, initialValue = '' }: TagInputProps) => {
  const [value, setValue] = useState(initialValue);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [inputWidth, setInputWidth] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const clickingSuggestionRef = useRef(false);
  const submittedRef = useRef(false);
  const { colors } = useTheme();

  const isEditing = !!initialValue;
  
  // Get all tags from all notes (for capitalization matching)
  const allTags = useAllTags();
  
  // Get tag suggestions derived from notes (but not when editing)
  const suggestions = isEditing ? [] : useTagSuggestions(value, existingTags);
  
  // Calculate actual display count (matches TagAutosuggestion logic)
  // When empty query, show all tags; when filtered, show suggestions; when no matches, show create option (1)
  const displayCount = value.trim() === '' 
    ? allTags.length 
    : (suggestions.length > 0 ? suggestions.length : 1); // 1 for "Create" option

  // Measure text width and update input width dynamically
  useEffect(() => {
    if (measureRef.current) {
      const textToMeasure = value || placeholder;
      measureRef.current.textContent = textToMeasure;
      const textWidth = measureRef.current.offsetWidth;
      // Add horizontal padding (8px * 2 = 16px) + caret buffer (2px)
      const totalWidth = textWidth + 16 + 2;
      setInputWidth(Math.max(totalWidth, 40));
    }
  }, [value, placeholder]);

  useEffect(() => {
    inputRef.current?.focus();
    // Place cursor at the end when editing an existing tag
    if (initialValue && inputRef.current) {
      const len = initialValue.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [initialValue]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [value]);

  // Calculate dropdown position when input is focused
  useEffect(() => {
    if (isFocused && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    } else {
      setDropdownPosition(null);
    }
  }, [isFocused]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmedValue = value.trim();
      
      // Get the actual displayed items (matches TagAutosuggestion logic)
      let displayedItems: string[];
      if (trimmedValue === '') {
        displayedItems = allTags;
      } else if (suggestions.length > 0) {
        displayedItems = suggestions;
      } else {
        // No matches - "Create" option shows the trimmed value
        displayedItems = [trimmedValue];
      }
      
      if (selectedIndex >= 0 && selectedIndex < displayedItems.length) {
        // Select from displayed items
        const selectedTag = displayedItems[selectedIndex];
        if (selectedTag && !existingTags.includes(selectedTag)) {
          submittedRef.current = true;
          onAddTag(selectedTag);
          setValue('');
        }
      } else if (trimmedValue) {
        // Add/update tag (fallback when no selection)
        // Check if this matches an existing tag from ALL notes (case-insensitive)
        const existingMatch = allTags.find(t => t.toLowerCase() === trimmedValue.toLowerCase());
        const tagToUse = existingMatch || trimmedValue; // Use existing capitalization if found
        
        if (!existingTags.some(t => t.toLowerCase() === tagToUse.toLowerCase())) {
          submittedRef.current = true;
          onAddTag(tagToUse);
          setValue('');
        }
      }
    } else if (e.key === 'Escape') {
      submittedRef.current = true;
      setValue('');
      onCancel?.();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (displayCount > 0) {
        setSelectedIndex((prev) => (prev === -1 ? 0 : (prev + 1) % displayCount)); // Wrap to start
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (displayCount > 0) {
        setSelectedIndex((prev) => (prev === -1 ? displayCount - 1 : (prev - 1 + displayCount) % displayCount)); // Wrap to end
      }
    }
  }, [selectedIndex, displayCount, value, existingTags, allTags, suggestions, onAddTag, onCancel]);

  const handleSelectSuggestion = useCallback((tag: string) => {
    clickingSuggestionRef.current = true;
    submittedRef.current = true;
    if (!existingTags.includes(tag)) {
      onAddTag(tag);
      setValue('');
    }
    // Reset flag after a short delay
    setTimeout(() => {
      clickingSuggestionRef.current = false;
    }, 100);
  }, [existingTags, onAddTag]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    
    // Skip blur handler if already submitted via Enter/Escape or clicking suggestion
    if (clickingSuggestionRef.current || submittedRef.current) {
      return;
    }
    
    // Delay to allow click on suggestion
    setTimeout(() => {
      // Double-check flags in case they were set during the timeout
      if (clickingSuggestionRef.current || submittedRef.current) {
        return;
      }
      
      if (value.trim()) {
        const trimmedTag = value.trim();
        
        // Check if this matches an existing tag from ALL notes (case-insensitive)
        const existingMatch = allTags.find(t => t.toLowerCase() === trimmedTag.toLowerCase());
        const tagToUse = existingMatch || trimmedTag; // Use existing capitalization if found
        
        if (!existingTags.some(t => t.toLowerCase() === tagToUse.toLowerCase())) {
          onAddTag(tagToUse);
        }
      }
      setValue('');
      onCancel?.();
    }, 200);
  }, [value, existingTags, allTags, onAddTag, onCancel]);

  const handleCloseDropdown = useCallback(() => {
    setIsFocused(false);
    setDropdownPosition(null);
  }, []);

  return (
    <>
      <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
        {/* Hidden span to measure text width */}
        <span
          ref={measureRef}
          style={{
            position: 'absolute',
            visibility: 'hidden',
            whiteSpace: 'pre',
            fontSize: '14px',
            fontWeight: 400,
            fontFamily: 'inherit',
          }}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          style={{
            padding: '0px 4px',
            fontSize: '14px',
            fontWeight: 400,
            fontFamily: 'inherit',
            color: colors.text.secondary,
            caretColor: colors.text.default,
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: isEditing ? radius['3'] : 0,
            outline: 'none',
            width: inputWidth ? `${inputWidth}px` : 'auto',
            minWidth: isEditing ? '40px' : '120px',
            margin: 0,
            height: '20px',
            minHeight: '20px',
            lineHeight: '20px',
            display: 'inline-block',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tag Autosuggestion Dropdown */}
      <TagAutosuggestion
        isOpen={isFocused && !isEditing}
        position={dropdownPosition}
        onClose={handleCloseDropdown}
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectTag={handleSelectSuggestion}
        query={value}
        existingTags={existingTags}
      />
    </>
  );
};

