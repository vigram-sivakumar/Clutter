import { Entry } from '@components/entry/Entry';
import { AppIcon } from '@shared/icon';
import type { FolderChildItem } from './FolderPageModel';
import { PageBody } from '@app/layouts/page/body/Page.Body';

export interface FolderBodyProps {
  readonly children: readonly FolderChildItem[];
}

export function FolderBody({ children }: FolderBodyProps) {
  return (
    <PageBody>
      {children.map((child) => (
        <Entry
          key={child.id}
          leading={<AppIcon icon={child.icon} emoji={child.emoji} />}
          selected={child.selected}
          onClick={child.onClick}
        >
          {child.title}
        </Entry>
      ))}
    </PageBody>
  );
}
