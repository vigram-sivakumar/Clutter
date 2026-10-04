/**
 * TEMPORARY DESIGN-LAB OVERLAY — DEV ONLY.
 *
 * A full-window layer over the running app (toggle: Cmd/Ctrl+Shift+L) that
 * renders the three list UIs being unified — PickerList, a note picker
 * (PickerList fed with notes), and the real CM6 autocomplete popups — next
 * to each other, so a CSS/token/component edit hot-reloads in front of you.
 * It uses the real components and the real CM6 extensions, not mocks.
 *
 * This is for design iteration only. Editor behavior is still verified in a
 * real note in the real app.
 *
 * DELETE THIS FOLDER (src/app/devLab/) and its call site in main.tsx when the
 * autocomplete design is done. Nothing here ships: main.tsx only imports it
 * inside an `import.meta.env.DEV` branch.
 */
import { useEffect, useRef, useState } from 'react';
import { startCompletion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView, tooltips } from '@codemirror/view';

import { PickerList } from '@components/picker-list/PickerList';
import { PickerCard } from '@components/picker-card/PickerCard';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { CoverNotePicker } from '../layouts/app-layout/CoverNotePicker';
import { markdownLanguageExtension } from '@features/markdown/editor/codemirror/markdownLanguage';
import { semanticCompletion } from '@features/markdown/editor/codemirror/completion';
import { wikiLinkAutocomplete } from '@features/markdown/editor/codemirror/wikilink/wikiLinkAutocomplete';
import { embedAutocomplete } from '@features/markdown/editor/codemirror/embed/embedAutocomplete';
import { tagAutocomplete } from '@features/markdown/editor/codemirror/tag/tagAutocomplete';
import { dateAutocomplete } from '@features/markdown/editor/codemirror/date/dateAutocomplete';

import {
  labEmbedSuggestions,
  labCoverFolderItems,
  labFolderItems,
  labHeadingSuggestions,
  labAssetItems,
  labNoteItems,
  labTagSuggestions,
  labWikiLinkSuggestions,
} from './labVault';
import './DevLab.css';

/** Flip to true to show the folder picker again. */
const SHOW_FOLDER_PICKER = false;

interface SampleProps {
  readonly title: string;
  readonly doc: string;
  readonly caret: number;
}

/** A real CM6 editor with the real semantic-completion extensions, popup opened on mount. */
function CompletionSample({ title, doc, caret }: SampleProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc,
        selection: { anchor: caret },
        extensions: [
          markdownLanguageExtension(),
          // The popup renders inside its frame (not at the window's origin), so frames line up.
          tooltips({ parent: host, position: 'absolute' }),
          semanticCompletion(
            () => labWikiLinkSuggestions,
            () => labTagSuggestions,
            () => labEmbedSuggestions,
            () => labHeadingSuggestions
          ),
          wikiLinkAutocomplete(),
          embedAutocomplete(),
          tagAutocomplete(),
          dateAutocomplete(),
        ],
      }),
    });
    view.focus();
    const timer = window.setTimeout(() => startCompletion(view), 50);
    return () => {
      window.clearTimeout(timer);
      view.destroy();
    };
  }, [doc, caret]);

  return (
    <section className="dev-lab__cell">
      <h3 className="dev-lab__cell-title">{title}</h3>
      <div className="dev-lab__editor" ref={hostRef} />
    </section>
  );
}

export function DevLab() {
  const [open, setOpen] = useState(false);
  const [realPickerOpen, setRealPickerOpen] = useState(false);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const moveAnchorRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<string>(() => document.documentElement.getAttribute('data-theme') ?? 'light');

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The real Overlay sits at z-index 1000, below this lab layer — lift it while the lab is open.
  useEffect(() => {
    if (!open) {
      return;
    }
    document.documentElement.style.setProperty('--z-overlay', '10000');
    return () => {
      document.documentElement.style.removeProperty('--z-overlay');
    };
  }, [open]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (!open) {
    return null;
  }

  return (
    <div className="dev-lab" role="dialog" aria-label="Design lab">
      <header className="dev-lab__header">
        <strong>Design lab</strong>
        <span className="dev-lab__hint">Cmd/Ctrl+Shift+L or Esc to close · dev only</span>
        <button type="button" ref={moveAnchorRef} onClick={() => setMovePickerOpen(true)}>
          Open the real Move picker
        </button>
        <button type="button" onClick={() => setRealPickerOpen(true)}>
          Open the real cover picker
        </button>
        <button type="button" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
          Theme: {theme}
        </button>
      </header>

      <MoveDestinationPicker
        anchorRef={moveAnchorRef as React.RefObject<HTMLElement>}
        open={movePickerOpen}
        items={labFolderItems}
        onSelect={() => setMovePickerOpen(false)}
        onCreateFolder={async () => 'new-folder'}
        onClose={() => setMovePickerOpen(false)}
      />
      <CoverNotePicker
        open={realPickerOpen}
        notes={labNoteItems}
        folders={labCoverFolderItems}
        onSelect={() => setRealPickerOpen(false)}
        onClose={() => setRealPickerOpen(false)}
      />

      <h2 className="dev-lab__group">Pickers</h2>
      <div className="dev-lab__grid">
        {SHOW_FOLDER_PICKER && (
          <section className="dev-lab__cell">
            <h3 className="dev-lab__cell-title">Folder picker</h3>
            <PickerList items={labFolderItems} onSelect={() => {}} />
          </section>
        )}
        <section className="dev-lab__cell">
          <h3 className="dev-lab__cell-title">Note picker</h3>
          <PickerCard
            title="Set cover image"
            onClose={() => {}}
            items={[...labAssetItems, ...labNoteItems, ...labCoverFolderItems]}
            placeholder="Search notes and folders…"
            leadingIcon="note"
            sectionLimit={5}
            onSelect={() => {}}
          />
        </section>
      </div>

      <h2 className="dev-lab__group">CM6 autocomplete (real extensions)</h2>
      <div className="dev-lab__grid">
        <CompletionSample title="[[ wikilink" doc="See [[" caret={6} />
        <CompletionSample title="![[ embed" doc="Image: ![[" caret={10} />
        <CompletionSample title="![[Page# headings" doc="![[Markdown format renders/Headings#" caret={36} />
        <CompletionSample title="# tag" doc="Tagged #" caret={8} />
        <CompletionSample title="@ date" doc="Due @" caret={5} />
      </div>
    </div>
  );
}
