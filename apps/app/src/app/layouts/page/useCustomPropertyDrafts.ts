import { useRef, useState } from 'react';

import type { CustomPropertyType } from '@core/properties/Property.types';

import type { PropertyDraft } from './buildPageProperties';

/**
 * The custom properties being added to the active page (a type chosen in the
 * property picker, until each is named) — transient UI state, never persisted:
 * switching to another page drops them, so an unnamed draft left behind
 * can't follow the user around or reach a note's frontmatter. The host
 * persists a property when its draft is named (PageOperations
 * .addCustomProperty) and then removes the draft.
 */
export function useCustomPropertyDrafts(pageId: string | null | undefined) {
  const [state, setState] = useState<{ pageId: string | null | undefined; drafts: PropertyDraft[] }>({
    pageId,
    drafts: [],
  });
  const nextId = useRef(0);
  // Drafts belong to the page they were added on.
  const drafts = state.pageId === pageId ? state.drafts : [];

  function update(change: (current: PropertyDraft[]) => PropertyDraft[]) {
    setState((previous) => ({
      pageId,
      drafts: change(previous.pageId === pageId ? previous.drafts : []),
    }));
  }

  return {
    drafts,
    /** Starts an unnamed draft of `type`. */
    add(type: CustomPropertyType) {
      update((current) => [...current, { id: nextId.current++, type }]);
    },
    /** Names a draft: it stays, as the named property being written, until `remove`. */
    name(id: number, name: string) {
      update((current) => current.map((draft) => (draft.id === id ? { ...draft, name } : draft)));
    },
    remove(id: number) {
      update((current) => current.filter((draft) => draft.id !== id));
    },
    /** Drops every draft of this page — e.g. when its Properties section is hidden. */
    clear() {
      update(() => []);
    },
  };
}
