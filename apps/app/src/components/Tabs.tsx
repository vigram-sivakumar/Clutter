import { createContext, useContext, type ReactNode } from 'react';
import '../styles/Tabs.css';

type TabsProps = {
  value: string;
  variant?: 'filled' | 'ghost';
  children?: ReactNode;
  onValueChange: (value: string) => void;
};

type TabProps = {
  value: string;
  children?: ReactNode;
};

// Shared active state
type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

// Tabs
export function Tabs({
  value,
  variant = 'filled',
  children,
  onValueChange,
}: TabsProps) {
  const className = ['tabs', `tabs--${variant}`].filter(Boolean).join(' ');

  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// Tab
export function Tab({ children, value }: TabProps) {
  const context = useContext(TabsContext);

  if (!context) {
    throw new Error('Tab must be used inside Tabs');
  }

  const isActive = context.value === value;

  const handleClick = () => {
    context.onValueChange(value);
  };

  const className = ['tab', isActive && 'tab--active']
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={className} onClick={handleClick}>
      {children}
    </button>
  );
}
