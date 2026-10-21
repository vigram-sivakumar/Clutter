import { useRef, useState } from 'react';
import { Button } from '@components/button/Button';
import { Menu } from '@components/menu/Menu';
import { MenuItem } from '@components/menu/MenuItem';
import { Overlay } from '@components/overlay/Overlay';
import { PageDivider } from '@app/layouts/page/PageDivider';
import {
  useHeaderSeparatorStyle,
  writeHeaderSeparatorStyle,
  type HeaderSeparatorStyle,
} from '@app/layouts/page/headerSeparator';
import { AppIcon } from '@shared/icon';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import './HeaderSeparatorStyleSetting.css';

/** The divider's variants under their user-facing names. */
const OPTIONS: { value: HeaderSeparatorStyle; label: string }[] = [
  { value: 'solid', label: 'Line' },
  { value: 'wavy', label: 'Wavy' },
  { value: 'dotted', label: 'Dotted' },
];

/** The divider itself in `style`, at preview size; hidden from assistive technology, the label already says it. */
function Preview({ style }: { style: HeaderSeparatorStyle }) {
  return (
    <span className="header-separator-style__preview" aria-hidden="true">
      <PageDivider variant={style} />
    </span>
  );
}

/** The same dropdown as the Header separator setting; the selected style's divider is drawn beside its name on the button. */
export function HeaderSeparatorStyleSetting() {
  const style = useHeaderSeparatorStyle();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = OPTIONS.find((option) => option.value === style)?.label;

  return (
    <SettingsEntry
      title="Header separator style"
      description="Choose how the line between a page's header and its content looks"
      trailing={
        <>
          <Button
            ref={triggerRef}
            variant="outline"
            trailing={<AppIcon icon="caretDown" size={12} />}
            isActive={menuOpen}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Header separator style: ${label}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="header-separator-style__value">
              {label}
              <Preview style={style} />
            </span>
          </Button>
          <Overlay
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={triggerRef}
            side="bottom"
            alignment="end"
          >
            <Menu size="medium">
              {OPTIONS.map((option) => (
                <MenuItem
                  key={option.value}
                  aria-current={option.value === style || undefined}
                  trailing={option.value === style ? <AppIcon icon="tick" /> : undefined}
                  onClick={() => {
                    writeHeaderSeparatorStyle(option.value);
                    setMenuOpen(false);
                  }}
                >
                  {option.label}
                </MenuItem>
              ))}
            </Menu>
          </Overlay>
        </>
      }
    />
  );
}
