type AvatarSize = 'small' | 'medium' | 'large';

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  src?: string;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0] ?? '').charAt(0) + (parts[1] ?? '').charAt(0)).toUpperCase();
  }
  const word = parts[0] ?? '';
  return word.length > 1
    ? word.charAt(0).toUpperCase() + word.charAt(1).toLowerCase()
    : word.charAt(0).toUpperCase();
}

export function Avatar({ name, size = 'medium', src, className }: AvatarProps) {
  const cls = [
    'clutter-avatar',
    `clutter-avatar--${size}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {src
        ? <img src={src} alt={name} className="clutter-avatar__img" />
        : <span className="clutter-avatar__initials">{getInitials(name)}</span>
      }
    </div>
  );
}
