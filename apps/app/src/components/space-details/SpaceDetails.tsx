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

/** A message if `name` can't be used as a folder name, otherwise null. */
export function validateSpaceName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name for your space.';
  if (trimmed === '.' || trimmed === '..') {
    return 'That name isn’t allowed.';
  }
  // `/` and `:` are path separators on macOS, `\` on Windows; control
  // characters are never valid in a file name.
  // eslint-disable-next-line no-control-regex
  if (/[/\\:\u0000-\u001f]/.test(trimmed)) {
    return 'A name can’t contain / \\ : or control characters.';
  }
  if (new TextEncoder().encode(trimmed).length > MAX_FOLDER_NAME_BYTES) {
    return 'That name is too long.';
  }
  return null;
}

interface SpaceDetailsProps {
  draft: NewSpaceDraft;
  onNameChange: (name: string) => void;
}

export function SpaceDetails({ draft, onNameChange }: SpaceDetailsProps) {
  const { shakeClassName, shake } = useRejectShake();
  // A missing name is signalled by the shake, not a message.
  const isNameEmpty = draft.name.trim() === '';
  const nameError = isNameEmpty ? null : validateSpaceName(draft.name);

  function handleNameChange(name: string) {
    if (name.trim() === '') shake();
    onNameChange(name);
  }

  return (
    <div className="space-details">
      <div className="space-details__card">
        <label className="space-details__label" htmlFor="space-details-name">
          Space Name
        </label>
        <Input
          id="space-details-name"
          className={['space-details__input', shakeClassName]
            .filter(Boolean)
            .join(' ')}
          hasBackground={false}
          hasBorder={false}
          value={draft.name}
          aria-invalid={isNameEmpty || nameError !== null}
          onChange={(event) => handleNameChange(event.target.value)}
        />
        {nameError && (
          <span className="space-details__error" role="alert">
            {nameError}
          </span>
        )}
      </div>
      <div className="space-details__card">
        <span className="space-details__label">Location</span>
        <span className="space-details__path" title={draft.parentPath}>
          {draft.parentName}/
        </span>
      </div>
      <Button className="space-details__button" variant="primary">
        Create
      </Button>
    </div>
  );
}
