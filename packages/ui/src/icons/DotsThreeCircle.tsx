import {
  DotsThreeCircle as PhosphorDotsThreeCircle,
  type IconProps,
} from '@phosphor-icons/react';
import { ICON_WEIGHT } from '../tokens/icons';

export const DotsThreeCircle = (props: IconProps) => {
  return <PhosphorDotsThreeCircle weight={ICON_WEIGHT} {...props} />;
};
