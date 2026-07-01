import '../design-system/styles/divider.css';

export type DividerProps = {
  className?: string;
};

export function Divider({ className }: DividerProps) {
  const dividerClassName = ['clutter-divider', className]
    .filter(Boolean)
    .join(' ');

  return <div role="separator" className={dividerClassName} />;
}
