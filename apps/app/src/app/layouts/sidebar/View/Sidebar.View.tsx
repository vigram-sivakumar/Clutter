import './Sidebar.View.css';

interface ViewProps {
  navigation?: React.ReactNode;
  children?: React.ReactNode;
}

export function View({ navigation, children }: ViewProps) {
  return (
    <div className="view">
      <div className="view--navigation">{navigation}</div>
      <div className="view--content">{children}</div>
    </div>
  );
}
