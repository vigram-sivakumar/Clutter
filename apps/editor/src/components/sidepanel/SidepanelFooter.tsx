import { Button } from '../Button';
import { Icons } from '../../design-system/icons';

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
          iconOnly={Icons.Gear}
          aria-label="Settings"
        />
        <Button
          type="button"
          variant="ghost"
          size="default"
          iconOnly={Icons.Question}
          aria-label="Help"
        />
      </div>
      <div className="clutter-sidepanel-footer__secondary">
        <Button
          type="button"
          variant="ghost"
          size="default"
          iconOnly={Icons.Trash}
          aria-label="Trash"
        />
      </div>
    </div>
  );
}
