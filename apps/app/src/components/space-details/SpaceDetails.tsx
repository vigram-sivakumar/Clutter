import { Input } from '../input/Input';
import './SpaceDetails.css';

/**
 * A newly created space. `name` is editable metadata (initially the folder's
 * name); `path` is where the space actually lives. Editing `name` never
 * renames the folder or changes `path`.
 */
export interface SelectedSpace {
  path: string;
  name: string;
}

interface SpaceDetailsProps {
  space: SelectedSpace;
  onNameChange: (name: string) => void;
}

export function SpaceDetails({ space, onNameChange }: SpaceDetailsProps) {
  return (
    <div className="space-details">
      <div className="space-details__card">
        <label className="space-details__label" htmlFor="space-details-name">
          Space Name
        </label>
        <Input
          id="space-details-name"
          className="space-details__input"
          hasBackground={false}
          hasBorder={false}
          value={space.name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </div>
      <div className="space-details__card">
        <span className="space-details__label">Path</span>
        <span className="space-details__path" title={space.path}>
          {space.path}
        </span>
      </div>
    </div>
  );
}
