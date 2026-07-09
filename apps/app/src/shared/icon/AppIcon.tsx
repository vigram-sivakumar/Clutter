import { CSSProperties } from 'react';

import { iconRegistry } from './iconRegistry';
import { Icon, SystemIcon } from './types';

/**
 * Default icon styling.
 *
 * These values define the appearance of every icon in Clutter.
 * Individual icons may override them when required.
 */
const DEFAULT_ICON_SIZE = 16;
const DEFAULT_STROKE_WIDTH = 1.5;

type BaseProps = {
  className?: string;
  style?: CSSProperties;
};

export type AppIconProps =
  | (BaseProps & {
      /** Dynamic icon from a model. */
      icon: Exclude<Icon, undefined>;
      name?: never;
    })
  | (BaseProps & {
      /** Static system icon. */
      name: SystemIcon;
      icon?: never;
    });

/**
 * Renders every icon in Clutter.
 *
 * Supports:
 * - SVG icons
 * - Emoji
 *
 * Future:
 * - Uploaded images
 */
export function AppIcon(props: AppIconProps) {
  const { className, style } = props;

  const icon: Icon = props.icon ?? {
    type: 'system',
    name: props.name!,
  };

  if (icon.type === 'emoji') {
    return (
      <span className={className} style={style}>
        {icon.value}
      </span>
    );
  }

  const IconComponent = iconRegistry[icon.name];

  if (!IconComponent) {
    return null;
  }

  return (
    <IconComponent
      width={DEFAULT_ICON_SIZE}
      height={DEFAULT_ICON_SIZE}
      strokeWidth={DEFAULT_STROKE_WIDTH}
      className={className}
      style={style}
    />
  );
}
