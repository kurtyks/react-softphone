import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';
import { Icon } from './Icon';

/** Labelled checkbox built from RN primitives (RN has no native checkbox). */
export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <Pressable style={styles.row} onPress={() => onChange(!checked)}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Icon name="check-circle" size={12} color={colors.white} />}
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: {
    width: 18,
    height: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gray500,
    alignItems: 'center',
    justifyContent: 'center'
  },
  boxChecked: { backgroundColor: colors.blue600, borderColor: colors.blue600 },
  label: { color: colors.gray200, fontSize: 14, flexShrink: 1 }
});
