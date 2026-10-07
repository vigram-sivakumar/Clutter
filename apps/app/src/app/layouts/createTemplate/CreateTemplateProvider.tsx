import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import type { Application } from '@core/application/Application';
import { NewFolderDialog } from '@features/notes/shortcuts/NewFolderDialog';
import {
  CREATE_TEMPLATE_LABELS,
  createTemplateFromPage,
  getCreateTemplateDefaults,
} from '@features/notes/helpers/createTemplateFromPage';

type RequestCreateTemplate = (pageId: string) => void;

const CreateTemplateContext = createContext<RequestCreateTemplate | undefined>(undefined);

/**
 * Asks to create a template from a page — opens the one Create template dialog. `undefined` outside
 * the provider (a surface rendered without one simply has no handler, never a silent no-op wired
 * to a live control). Hosted once, above both the sidebar and the page, so every entry point — a
 * sidebar row's menu, Favorites, a tag's note row, the topbar — opens the same dialog.
 */
export function useRequestCreateTemplate(): RequestCreateTemplate | undefined {
  return useContext(CreateTemplateContext);
}

/**
 * Owns the Create template dialog (the New folder dialog, configured) and its one piece of state:
 * which page it was opened for. Submitting calls `createTemplateFromPage` and closes; nothing is
 * navigated to, so the user stays on the page they asked from.
 */
export function CreateTemplateProvider({
  application,
  children,
}: {
  application: Application;
  children: ReactNode;
}) {
  const [sourcePageId, setSourcePageId] = useState<string | null>(null);
  const request = useCallback<RequestCreateTemplate>((pageId) => setSourcePageId(pageId), []);
  const close = useCallback(() => setSourcePageId(null), []);

  const source = sourcePageId ? application.effectivePageState.getPage(sourcePageId) : undefined;
  const defaults = source ? getCreateTemplateDefaults(source) : { name: '', description: '' };
  const templatesFolder = application.vault.getReservedFolder('templates');

  return (
    <CreateTemplateContext.Provider value={request}>
      {children}
      {/* Keyed by source so every open starts from that page's own defaults. */}
      <NewFolderDialog
        key={sourcePageId ?? 'none'}
        open={source !== undefined}
        onClose={close}
        labels={CREATE_TEMPLATE_LABELS}
        initialName={defaults.name}
        initialDescription={defaults.description}
        withIcon={false}
        withCancel
        // A template named like one already in Templates is refused up front, like a duplicate folder.
        canCreate={(name) =>
          !templatesFolder || application.pageOperations.canCreate(templatesFolder.id, name)
        }
        onSubmit={async (name, _icon, description) => {
          if (!sourcePageId) {
            return;
          }

          await createTemplateFromPage(
            {
              pageOperations: application.pageOperations,
              folderOperations: application.folderOperations,
              effectivePageState: application.effectivePageState,
            },
            sourcePageId,
            { name, description }
          );
        }}
      />
    </CreateTemplateContext.Provider>
  );
}
