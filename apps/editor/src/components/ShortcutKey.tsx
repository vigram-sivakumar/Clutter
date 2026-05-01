interface ShortcutKeyProps {
  label: string;
  border?: boolean;
  className?: string;
}

export function ShortcutKey({ label, border = false, className }: ShortcutKeyProps) {
  const cls = [
    'clutter-shortcut-key',
    border && 'clutter-shortcut-key--bordered',
    className,
  ].filter(Boolean).join(' ');
  return <span className={cls}>{label}</span>;
}
