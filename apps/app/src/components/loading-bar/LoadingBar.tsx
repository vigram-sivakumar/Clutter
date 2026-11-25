import { GradientGrainy } from '../gradient-grainy/GradientGrainy';
import './LoadingBar.css';

interface LoadingBarProps {
  label: string;
}

/** An indeterminate loading indicator; no estimated completion percentage. */
export function LoadingBar({ label }: LoadingBarProps) {
  return (
    <div className="loading-bar" role="progressbar" aria-label={label}>
      <GradientGrainy palette="iris" />
    </div>
  );
}
