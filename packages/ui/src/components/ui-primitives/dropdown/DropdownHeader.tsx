/**
 * DropdownHeader - Shared header/label for dropdown sections
 *
 * Used for section titles within dropdowns
 * Style matches SlashCommands - uppercase, small, subtle
 */

import { useTheme } from '../../../hooks/useTheme';
import { spacing } from '../../../tokens/spacing';
import { typography } from '../../../tokens/typography';

interface DropdownHeaderProps {
  label: string;
  /** Optional margin top for spacing between sections */
  marginTop?: string;
  /** Optional right-aligned hint text (always visible) */
  hint?: string;
}

export const DropdownHeader = ({ label, marginTop, hint }: DropdownHeaderProps) => {
  const { colors } = useTheme();

  return (
    <div
      style={{
        fontSize: typography.fontSize['10'],
        fontWeight: typography.fontWeight.normal,
        lineHeight: typography.lineHeight.tight,
        color: colors.text.tertiary,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: hint ? 'space-between' : 'flex-start',
        padding: `0 ${spacing['4']}`,
        marginTop: marginTop || '0',
      }}
    >
      <span>{label}</span>
      {hint && <span>{hint}</span>}
    </div>
  );
};
