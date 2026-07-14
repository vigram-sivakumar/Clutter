import './Menu.css';

interface MenuProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Menu({ children, className, ...props }: MenuProps) {
  return (
    <div role="menu" className={`Menu ${className}`} {...props}>
      {children}
    </div>
  );
}
