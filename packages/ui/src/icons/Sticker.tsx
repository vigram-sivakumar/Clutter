import {
  Sticker as PhosphorSticker,
  type IconProps,
} from '@phosphor-icons/react';

export const Sticker = (props: IconProps) => {
  return <PhosphorSticker weight="duotone" {...props} />;
};
