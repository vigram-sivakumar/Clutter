/** TEMPORARY — see DevLab.tsx. Mounts the lab in its own React root, separate from the app's. */
import { createRoot } from 'react-dom/client';

import { CollectionPrimitivesLab } from './CollectionPrimitivesLab';
import { DevLab } from './DevLab';

export function mountDevLab(): void {
  const host = document.createElement('div');
  host.id = 'dev-lab-root';
  document.body.appendChild(host);
  createRoot(host).render(
    <>
      <DevLab />
      <CollectionPrimitivesLab />
    </>
  );
}
