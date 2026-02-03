import {
  TextColumns as PhosphorTextColumns,
  type IconProps,
} from '@phosphor-icons/react';
import { ICON_WEIGHT } from '../tokens/icons';

export const TextColumns = (props: IconProps) => {
  return <PhosphorTextColumns weight={ICON_WEIGHT} {...props} />;
};
