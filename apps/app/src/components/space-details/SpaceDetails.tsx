import { Button } from '@components/button/Button';
import { Input } from '../input/Input';
import { useRejectShake } from '../property-list/useRejectShake';
import './SpaceDetails.css';

export const DEFAULT_SPACE_NAME = 'Clutter';

/**
 * A space the user is setting up. Nothing exists on disk yet: the folder
 * will be `<parentPath>/<name.trim()>`, created only when the (later)
 * confirm step runs.
 */
export interface NewSpaceDraft {
  /** Absolute path of the folder the space will be created in. */
  parentPath: string;
  /** That folder's display name, e.g. "Documents". */
  parentName: string;
  /** Space name — also the new folder's name. */
  name: string;
}

const MAX_FOLDER_NAME_BYTES = 255;

/** Whether `name` can be used as a folder name. */
export function isValidSpaceName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return false;
  // `/` and `:` are path separators on macOS, `\\` on Windows; control
  // characters are never valid in a file name.
  // eslint-disable-next-line no-control-regex
  if (/[/\\:\u0000-\u001f]/.test(trimmed)) return false;
  return new TextEncoder().encode(trimmed).length <= MAX_FOLDER_NAME_BYTES;
}

interface SpaceDetailsProps {
  draft: NewSpaceDraft;
  onNameChange: (name: string) => void;
}

export function SpaceDetails({ draft, onNameChange }: SpaceDetailsProps) {
  const { shakeClassName, shake } = useRejectShake();

  // An unusable name shakes the whole Space Name card, never a message; the input
  // is left exactly as typed.
  function handleNameChange(name: string) {
    if (!isValidSpaceName(name)) shake();
    onNameChange(name);
  }

  // Creating the folder comes later; for now Create only rejects a bad name.
  function handleCreate() {
    if (!isValidSpaceName(draft.name)) shake();
  }

  return (
    <div className="space-details">
      <div
        className={['space-details__card', shakeClassName]
          .filter(Boolean)
          .join(' ')}
      >
        <label className="space-details__label" htmlFor="space-details-name">
          Space Name
        </label>
        <Input
          id="space-details-name"
          className="space-details__input"
          hasBackground={false}
          hasBorder={false}
          value={draft.name}
          aria-invalid={!isValidSpaceName(draft.name)}
          onChange={(event) => handleNameChange(event.target.value)}
        />
      </div>
      <div className="space-details__card space-details__card--with-action">
        <div className="space-details__card-content">
          <span className="space-details__label">Location</span>
          <span className="space-details__path" title={draft.parentPath}>
            {draft.parentName}/
          </span>
        </div>
        <Button
          className="space-details__change-button"
          variant="filled"
          size="small"
        >
          Change
        </Button>
      </div>
      <Button
        className="space-details__button"
        variant="primary"
        onClick={handleCreate}
      >
        Create
      </Button>
    </div>
  );
}
