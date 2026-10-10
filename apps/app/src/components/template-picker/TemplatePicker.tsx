import type { RefObject } from 'react';

import { Popover } from '@components/popover/Popover';
import { PickerCard } from '@components/picker-card/PickerCard';
import type { PickerListItem } from '@components/picker-list/PickerList.types';
import type {
  OverlayAlignment,
  OverlaySide,
} from '@components/overlay/Overlay.types';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

export const NEW_TEMPLATE_ID = '__new-template__';

/** The template picker's rows: a leading "New template" row, then every template as a flat note row. */
export function templateItems(
  templates: readonly CollectionEntryModel[],
  defaultId: string | null
): PickerListItem[] {
  return [
    {
      id: NEW_TEMPLATE_ID,
      title: 'New template',
      icon: 'plus' as const,
      level: 0,
      parentId: null,
    },
    ...templates.map((template) => ({
      id: template.id,
      title: template.values.name,
      emoji: template.emoji,
      level: 0,
      parentId: null,
      // The folder's default template is identified by the Default pill.
      ...(template.id === defaultId && { pill: 'Default' }),
    })),
  ];
}

export interface TemplatePickerProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  /** Dismiss: the × button, Escape and an outside click. Choosing a row does not call it — the caller closes. */
  onClose: () => void;
  templates: readonly CollectionEntryModel[];
  /** The template shown with a Default pill, if any. */
  defaultTemplateId?: string | null;
  /** A template row was chosen; what that does (apply it, make it a default...) is the caller's. */
  onSelectTemplate: (templateId: string) => void;
  /** The leading "New template" row was chosen; the caller runs its creation flow. */
  onNewTemplate: () => void;
  side?: OverlaySide;
  alignment?: OverlayAlignment;
}

/**
 * The searchable template list — Popover + PickerCard with a leading "New template" row. Controlled and
 * orchestration-free: it never creates a template or applies one to a note, it reports the choice.
 */
export function TemplatePicker({
  anchorRef,
  open,
  onClose,
  templates,
  defaultTemplateId = null,
  onSelectTemplate,
  onNewTemplate,
  side,
  alignment,
}: TemplatePickerProps) {
  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      returnFocusRef={anchorRef}
      side={side}
      alignment={alignment}
    >
      <PickerCard
        title="Templates"
        onClose={onClose}
        items={open ? templateItems(templates, defaultTemplateId) : []}
        placeholder="Search templates"
        leadingIcon="template"
        onSelect={(item) =>
          item.id === NEW_TEMPLATE_ID ? onNewTemplate() : onSelectTemplate(item.id)
        }
      />
    </Popover>
  );
}
