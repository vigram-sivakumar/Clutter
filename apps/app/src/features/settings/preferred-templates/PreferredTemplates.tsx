import { useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@components/button/Button';
import { Entry } from '@components/entry/Entry';
import { TemplatePicker } from '@components/template-picker/TemplatePicker';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { AppIcon } from '@shared/icon';
import type { PreferredTemplatesContext } from '@core/application/templates/PreferredTemplatesStore';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';
import { SettingsSection } from '../settings-section/SettingsSection';
import './PreferredTemplates.css';

/** What the settings need from the open Space; supplied by whoever renders Settings (the sidebar footer). */
export interface TemplatesSource {
  /** The templates, in the order every other template picker shows them (most recently used first). */
  getTemplates(): readonly CollectionEntryModel[];
  /** The picker's leading "New template" row. */
  onCreateTemplate(): void;
  /** Opens a template's note in the current Space, like any note. */
  onOpenTemplate(templateId: string): void;
  /** The user's preferred templates per context: template page ids in selection order, persisted per Space. */
  preferred: {
    getIds(context: PreferredTemplatesContext): readonly string[];
    add(templateId: string, context: PreferredTemplatesContext): void;
    remove(templateId: string, context: PreferredTemplatesContext): void;
    subscribe(listener: () => void): () => void;
    /** The template applied to a new Daily Note (a template page id), or undefined for None. */
    getDefaultDailyNoteId?(): string | undefined;
    setDefaultDailyNote?(templateId: string | undefined): void;
  };
}

interface PreferredTemplatesProps {
  templates?: TemplatesSource;
  /** Which list this page edits: regular Notes, or Daily notes (the default). */
  context?: PreferredTemplatesContext;
  /** Closes the Settings dialog; called just before a template is opened, so the note isn't opened behind it. */
  onCloseSettings?: () => void;
}

const NO_IDS: readonly string[] = [];
const noopSubscribe = () => () => {};
const noIds = () => NO_IDS;

/**
 * The "Templates" group of the Notes and Daily notes settings pages (each edits its own list): the "Preferred templates" entry (its button opens the existing
 * template picker) followed by one Entry row per template the user picked, each removable. Removing only
 * drops the preference — the template note itself is never touched, and it can be picked again.
 */
export function PreferredTemplates({
  templates,
  context = 'dailyNotes',
  onCloseSettings,
}: PreferredTemplatesProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [defaultPickerOpen, setDefaultPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const defaultTriggerRef = useRef<HTMLButtonElement>(null);
  const ids = useSyncExternalStore(
    templates?.preferred.subscribe ?? noopSubscribe,
    templates ? () => templates.preferred.getIds(context) : noIds
  );
  const defaultId = useSyncExternalStore(
    templates?.preferred.subscribe ?? noopSubscribe,
    () => templates?.preferred.getDefaultDailyNoteId?.()
  );

  const available = templates?.getTemplates() ?? [];
  // A preferred id whose template is gone (deleted, archived) can't be shown; it is skipped, not removed.
  const selected = ids
    .map((id) => available.find((template) => template.id === id))
    .filter(
      (template): template is CollectionEntryModel => template !== undefined
    );

  // The picker only offers what isn't preferred yet; a removed template comes back into it.
  const unselected = available.filter((template) => !ids.includes(template.id));

  // The Daily notes page also chooses the one template applied to a new Daily Note. A default whose template is
  // gone (deleted, archived, moved out of Templates) can't be shown, so it reads as None — the saved id stays,
  // and nothing is applied while it can't be resolved.
  const hasDefaultSetting =
    context === 'dailyNotes' && templates?.preferred.setDefaultDailyNote !== undefined;
  const defaultTemplate = available.find((template) => template.id === defaultId);

  // One Entry row for a template, drawn as every other template row is (the "Start with template" suggestions,
  // the picker): the note's own emoji when it has one, otherwise the Template icon. `template.icon` is the generic
  // note-type icon of the collection entry, which is not a template's icon. The whole row opens the template, after
  // closing Settings so the note isn't opened behind the dialog; the trailing button only removes the preference.
  const templateRow = (template: CollectionEntryModel, onRemove: () => void) => (
    <Entry
      key={template.id}
      leading={<AppIcon icon="template" emoji={template.emoji} />}
      onClick={() => {
        onCloseSettings?.();
        templates?.onOpenTemplate(template.id);
      }}
      trailing={
        <Button
          isIconOnly
          size="xs"
          variant="ghost"
          aria-label={`Remove ${template.values.name}`}
          onClick={(event) => {
            // Removing a preference must not also open the template.
            event.stopPropagation();
            onRemove();
          }}
        >
          <AppIcon icon="dismiss" size={12} />
        </Button>
      }
    >
      <span className="truncate">{template.values.name}</span>
    </Entry>
  );

  // The Daily notes page's own group for the one default template: its entry and, once one is chosen, that
  // template below it. A single selection, kept out of the list in the Templates group.
  const defaultGroup = hasDefaultSetting ? (
    <SettingsGroup>
      {[
            <SettingsEntry key="default-daily-note-template"
              title="Default"
              description="Choose which template to apply when creating a daily note"
              trailing={
                defaultTemplate ? undefined : (
                  <>
                    <Button
                      ref={defaultTriggerRef}
                      size="small"
                      variant="outline"
                      // Stays in its hover state while the picker is open.
                      isActive={defaultPickerOpen}
                      aria-haspopup="dialog"
                      aria-expanded={defaultPickerOpen}
                      onClick={() => setDefaultPickerOpen(true)}
                    >
                      Select template
                    </Button>
                    <TemplatePicker
                      anchorRef={defaultTriggerRef}
                      open={defaultPickerOpen}
                      onClose={() => setDefaultPickerOpen(false)}
                      templates={defaultPickerOpen ? available : []}
                      side="bottom"
                      alignment="end"
                      onSelectTemplate={(templateId) => {
                        templates?.preferred.setDefaultDailyNote?.(templateId);
                        setDefaultPickerOpen(false);
                      }}
                      onNewTemplate={() => {
                        setDefaultPickerOpen(false);
                        templates?.onCreateTemplate();
                      }}
                    />
                  </>
                )
              }
            />,
            ...(defaultTemplate
              ? [
                  <div
                    key="default-daily-note-template-row"
                    className="preferred-templates__list preferred-templates__list--default"
                  >
                    {templateRow(defaultTemplate, () => templates?.preferred.setDefaultDailyNote?.(undefined))}
                  </div>,
                ]
              : []),
      ]}
    </SettingsGroup>
  ) : null;

  const preferredGroup = (
      <SettingsGroup title={hasDefaultSetting ? undefined : 'Template'}>
        {[
            <SettingsEntry
              key="preferred-templates"
              title="Preferred templates"
              description="Choose which templates appear first in suggestions"
              trailing={
                <>
                  <Button
                    ref={triggerRef}
                    variant="outline"
                    // Stays in its hover state while the picker is open.
                    isActive={pickerOpen}
                    aria-haspopup="dialog"
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen(true)}
                  >
                    Choose templates
                  </Button>
                  <TemplatePicker
                    anchorRef={triggerRef}
                    open={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    templates={pickerOpen ? unselected : []}
                    side="bottom"
                    alignment="end"
                    onSelectTemplate={(templateId) => {
                      templates?.preferred.add(templateId, context);
                      setPickerOpen(false);
                    }}
                    onNewTemplate={() => {
                      setPickerOpen(false);
                      templates?.onCreateTemplate();
                    }}
                  />
                </>
              }
            />,
            // The selection, one compact Entry row per template, in the order they were chosen.
            ...(selected.length > 0
              ? [
                  <div key="selected" className="preferred-templates__list">
                    {selected.map((template) =>
                      templateRow(template, () => templates?.preferred.remove(template.id, context))
                    )}
                  </div>,
                ]
              : []),
        ]}
      </SettingsGroup>
  );

  // The Daily notes page stacks its two groups under one "Template" title; the Notes page has just the one group.
  return hasDefaultSetting ? (
    <SettingsSection title="Template">
      {defaultGroup}
      {preferredGroup}
    </SettingsSection>
  ) : (
    preferredGroup
  );
}
