import '../../styles/Sidebar.View.css';
import { Divider } from '../Divider';

interface ViewProps {
  navigation?: React.ReactNode;
  children?: React.ReactNode;
}

export function View({ navigation, children }: ViewProps) {
  return (
    <div className="view">
      <div className="view--navigation">{navigation}</div>
      <Divider />
      <div className="view--content">{children}</div>
    </div>
  );
}
