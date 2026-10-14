import './SpaceDetails.css';

/** A folder the user picked or created on the welcome screen. */
export interface SelectedSpace {
  path: string;
  name: string;
}

interface SpaceDetailsProps {
  space: SelectedSpace;
}

// UI to be designed — `space` is the folder chosen on the welcome screen.
export function SpaceDetails(_props: SpaceDetailsProps) {
  return <div />;
}
