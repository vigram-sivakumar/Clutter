import { Avatar } from './Avatar';

export function Topbar() {
  return (
    <header
      className="clutter-global-topbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
      }}
    >
      <Avatar name="Finance" size="small" />
      <Avatar name="My personal space" size="medium" />
      <Avatar name="Vigrfam" size="large" />
    </header>
  );
}
