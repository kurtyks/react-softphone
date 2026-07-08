import { colors, radius } from '@/theme';

/**
 * Dropdown. React Native has no built-in <select>; since this app targets web
 * (react-native-web on react-dom), we render a real styled DOM <select>. When the
 * app later targets native, swap this for @react-native-picker/picker.
 */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  flexGrow?: boolean;
}

export function Select({ value, options, onValueChange, ariaLabel, flexGrow }: SelectProps) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onValueChange(e.target.value)}
      style={{
        width: '100%',
        flexGrow: flexGrow ? 1 : undefined,
        minWidth: 0,
        backgroundColor: colors.gray700,
        color: colors.white,
        border: `1px solid ${colors.gray600}`,
        borderRadius: radius.md,
        padding: 8,
        fontSize: 14
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
