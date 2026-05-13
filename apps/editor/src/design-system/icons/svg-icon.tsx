import type { CSSProperties, FC, SVGProps } from 'react';

import { ICON_MEDIUM } from './constants';

export type CustomSvgIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

type SvgFromSvgr = FC<SVGProps<SVGSVGElement>>;

/** Wrap SVGR `?react` components; default size follows `ICON_MEDIUM`. */
export function withSvgIcon(Svg: SvgFromSvgr): FC<CustomSvgIconProps> {
  const Wrapped: FC<CustomSvgIconProps> = ({ size = ICON_MEDIUM, width, height, style, ...rest }) => {
    const mergedStyle: CSSProperties = {
      display: 'block',
      flexShrink: 0,
      color: 'inherit',
      ...(style && typeof style === 'object' ? style : {}),
    };
    return (
      <Svg
        width={width ?? size}
        height={height ?? size}
        style={mergedStyle}
        {...rest}
      />
    );
  };
  Wrapped.displayName = Svg.displayName ?? 'SvgIcon';
  return Wrapped;
}
