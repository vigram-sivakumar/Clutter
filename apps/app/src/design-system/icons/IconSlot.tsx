import './icon-slot.css';

interface IconSlotProps {
  children: React.ReactNode;
}

export function IconSlot({ children }: IconSlotProps) {
  return <div className="icon-slot">{children}</div>;
}
