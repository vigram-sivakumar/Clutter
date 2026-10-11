import { useRef, useState, type RefObject } from 'react';
import { TemplatePicker } from '@components/template-picker/TemplatePicker';
import { TemplateSuggestions } from '@components/template-suggestions/TemplateSuggestions';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

export interface CurrentNoteTemplateSuggestionsProps {
  /** The templates, in the order to show them (most recently used first). */
  templates: readonly CollectionEntryModel[];
  /** Applies the template page `templateId` to the current note — never creates one. */
  onApply: (templateId: string) => void;
  /** The picker's leading "New template" row. */
  onCreateTemplate: () => void;
}

/**
 * "Start with template" for the open, empty note: the suggestion row, and — behind its "+N more" entry —
 * the same template picker the Add menu's From template opens (same rows, search and "New template"
 * row), except that choosing a template applies it to this note.
 */
export function CurrentNoteTemplateSuggestions({
  templates,
  onApply,
  onCreateTemplate,
}: CurrentNoteTemplateSuggestionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);

  return (
    <>
      <TemplateSuggestions
        templates={templates}
        onSelect={(template) => onApply(template.id)}
        onOverflowClick={(anchor) => {
          anchorRef.current = anchor;
          setPickerOpen(true);
        }}
      />
      <TemplatePicker
        anchorRef={anchorRef as RefObject<HTMLElement>}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        templates={templates}
        side="top"
        alignment="end"
        onSelectTemplate={(templateId) => {
          setPickerOpen(false);
          onApply(templateId);
        }}
        onNewTemplate={() => {
          setPickerOpen(false);
          onCreateTemplate();
        }}
      />
    </>
  );
}
