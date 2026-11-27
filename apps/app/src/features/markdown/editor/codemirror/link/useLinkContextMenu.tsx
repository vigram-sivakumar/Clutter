import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditorView } from '@codemirror/view';

import {
  OverflowMenuBody,
  type OverflowMenuItemConfig,
} from '@components/menu/OverflowMenu';
import { Overlay } from '@components/overlay/Overlay';
import { useToast } from '@components/toast/ToastProvider';
import { copyWithFeedback } from '@shared/helpers/copyWithFeedback';
import { openExternalUrl } from '@shared/helpers/openExternalUrl';

import { isWithinTokenBounds } from '../semanticToken/tokenMouseHandlers';
import { editorLinkAt, type EditorLink } from './linkContextMenu';
import { projectedLinkAt } from '../table/renderInlineMarkdown';

const items: OverflowMenuItemConfig[] = [
  { id: 'copy-url', label: 'Copy URL', icon: 'link' },
  { id: 'copy-markdown', label: 'Copy as Markdown', icon: 'copy' },
  { id: 'open', label: 'Open in Browser', icon: 'arrowUpRight' },
];

/** Editor-specific targets and actions; all menu interaction and placement belong to the shared components. */
export function useLinkContextMenu(): {
  onContextMenu(event: MouseEvent<HTMLElement>): void;
  overlay: ReactNode;
} {
  const toast = useToast();
  const [request, setRequest] = useState<{
    link: EditorLink;
    x: number;
    y: number;
  } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const suppressReturnFocusRef = useRef(false);
  const close = () => setRequest(null);

  return {
    onContextMenu(event) {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !event.currentTarget.contains(target)
      )
        return;
      // Use the nearest view: table cells and embedded notes may have their own document coordinates.
      const editor = target.closest<HTMLElement>('.cm-editor');
      const view = editor && EditorView.findFromDOM(editor);
      if (!view || !view.contentDOM.contains(target)) return;
      let link: EditorLink | null;
      // Static table cells have no independent CM coordinates. Their
      // painted occurrence supplies the same payload as a live editor.
      // A nested active editor's enclosing table is outside its contentDOM.
      // The engine-cells attribute is deliberately editable-only. Both
      // editable and read-only projections share the table widget class.
      const table = target.closest<HTMLElement>('.cm-table-widget');
      if (table && view.contentDOM.contains(table)) {
        const host = target.closest<HTMLElement>('.cm-table-cell-wrapper[data-cell]');
        if (!host || !table.contains(host)) return;
        link = projectedLinkAt(host, target);
        if (!link) return;
      } else {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return;
        link = editorLinkAt(view.state, pos);
        if (!link || !isWithinTokenBounds(view, link, event.clientX, event.clientY)) return;
      }
      event.preventDefault();
      event.stopPropagation();
      returnFocusRef.current = view.contentDOM;
      setRequest({ link, x: event.clientX, y: event.clientY });
    },
    overlay: (
      <>
        {request &&
          createPortal(
            <span
              ref={anchorRef}
              aria-hidden="true"
              style={{
                position: 'fixed',
                left: request.x,
                top: request.y,
                width: 0,
                height: 0,
                pointerEvents: 'none',
              }}
            />,
            document.body
          )}
        <Overlay
          open={request !== null}
          onClose={close}
          anchorRef={anchorRef}
          returnFocusRef={returnFocusRef}
          side="bottom"
          alignment="start"
          offset={0}
          suppressReturnFocusRef={suppressReturnFocusRef}
        >
          {request && (
            <OverflowMenuBody
              items={items}
              size="small"
              suppressReturnFocusRef={suppressReturnFocusRef}
              onOpenChange={(open) => {
                if (!open) close();
              }}
              onSelect={(id) => {
                if (id === 'copy-url')
                  void copyWithFeedback(request.link.url, 'URL copied', toast);
                if (id === 'copy-markdown')
                  void copyWithFeedback(
                    request.link.markdown,
                    'Markdown copied',
                    toast
                  );
                if (id === 'open')
                  void openExternalUrl(request.link.url).catch((error) =>
                    toast.fail('Couldn’t open URL', error)
                  );
              }}
            />
          )}
        </Overlay>
      </>
    ),
  };
}
