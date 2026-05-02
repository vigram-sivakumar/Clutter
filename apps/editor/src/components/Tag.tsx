type TagColor = 'blue' | 'green' | 'grey' | 'indigo' | 'orange' | 'purple' | 'red' | 'yellow' | 'dark-grey';
type TagSize = 'default' | 'small';

interface TagProps {
  label: string;
  color?: TagColor;
  size?: TagSize;
  className?: string;
}

export function Tag({ label, color = 'green', size = 'default', className }: TagProps) {
  const cls = [
    'clutter-tag',
    `clutter-tag--${color}`,
    size === 'small' && 'clutter-tag--small',
    className,
  ].filter(Boolean).join(' ');
  return <span className={cls}>{label}</span>;
}
