import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Overlay } from '@components/overlay/Overlay';
import { AppIcon } from '@shared/icon';
import { AddPropertyMenu } from './AddPropertyMenu';
import type { PropertiesControl } from './propertiesControl';

/**
 * The page title section's Properties control, beside the More actions
 * button (see PageHeaderControls). Its label follows the note's lifecycle
 * (PropertiesControl):
 *
 * - "Add a property" before the first property exists — opens the existing
 *   Add properties menu (AddPropertyMenu) anchored to the button;
 * - then only the section toggle, "Hide properties" / "Show properties",
 *   which changes nothing but whether the section is shown.
 *
 * Revealed on hover like More actions, and kept visible while its menu is
 * open. Choosing in the menu never returns focus to this button, so a new
 * property's name field keeps the focus it just took.
 */
export function PageHeaderPropertiesControl({ control }: { control: PropertiesControl }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const suppressReturnFocusRef = useRef(false);

  const isAdd = control.mode === 'add';
  const label = isAdd ? 'Add a property' : control.shown ? 'Hide properties' : 'Show properties';

  function finishWithChoice() {
    suppressReturnFocusRef.current = true;
    setOpen(false);
  }

  return (
    <>
      <Button
        className="page-header-controls__properties"
        ref={anchorRef}
        variant="outline-fill"
        size="small"
        leading={isAdd ? <AppIcon icon="plus" /> : undefined}
        aria-haspopup={isAdd ? 'menu' : undefined}
        aria-expanded={isAdd ? open : undefined}
        onClick={() => {
          if (control.mode === 'toggle') {
            control.onToggle();
            return;
          }
          suppressReturnFocusRef.current = false;
          setOpen((value) => !value);
        }}
      >
        {label}
      </Button>
      {control.mode === 'add' && (
        <Overlay
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          side="bottom"
          alignment="start"
          suppressReturnFocusRef={suppressReturnFocusRef}
        >
          <AddPropertyMenu
            systemProperties={control.menu.systemProperties}
            hiddenProperties={control.menu.hiddenProperties}
            onShowProperty={
              control.menu.onShowProperty &&
              ((key) => {
                finishWithChoice();
                control.menu.onShowProperty?.(key);
              })
            }
            onAddCustomProperty={(type) => {
              finishWithChoice();
              control.menu.onAddCustomProperty(type);
            }}
          />
        </Overlay>
      )}
    </>
  );
}
