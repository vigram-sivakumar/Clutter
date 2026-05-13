import { Button } from '../Button';
import { CustomIcons } from '../../design-system/icons';

/**
 * Bottom actions row — settings, help, trash (Figma: Actions, node 548:17170).
 */
export function SidepanelFooter() {
  return (
    <div className="clutter-sidepanel-footer">
      <div className="clutter-sidepanel-footer__primary">
        <Button
          type="button"
          variant="ghost"
          size="default"
          iconOnly={CustomIcons.Settings}
          aria-label="Settings"
        />
        <Button
          type="button"
          variant="ghost"
          size="default"
          iconOnly={CustomIcons.Keyboard}
          aria-label="Help"
        />
      </div>
      <div className="clutter-sidepanel-footer__secondary">
        <Button
          type="button"
          variant="ghost"
          size="default"
          iconOnly={CustomIcons.Archive}
          aria-label="Trash"
        />
      </div>
    </div>
  );
}
