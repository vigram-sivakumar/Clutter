type DividerSpacing = 'sm' | 'md' | 'lg';

interface DividerProps {
  vertical?: boolean;
  spacing?: DividerSpacing;
  className?: string;
}

export function Divider({ vertical = false, spacing, className }: DividerProps) {
  const cls = [
    'clutter-divider',
    vertical && 'clutter-divider--vertical',
    spacing && `clutter-divider--spacing-${spacing}`,
    className,
  ].filter(Boolean).join(' ');
  return <div role="separator" aria-orientation={vertical ? 'vertical' : 'horizontal'} className={cls} />;
}
