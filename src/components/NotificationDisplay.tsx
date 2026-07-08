import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  notifications,
  removeNotification,
  type AppNotification
} from '@/lib/notifications';
import { useStore } from '@/lib/useStore';
import { colors, radius } from '@/theme';
import { Icon } from './Icon';

function iconFor(type: AppNotification['type']): string {
  switch (type) {
    case 'success':
      return 'check-circle';
    case 'warning':
      return 'exclamation-triangle';
    case 'error':
      return 'times-circle';
    default:
      return 'info-circle';
  }
}

function bgFor(type: AppNotification['type']): string {
  switch (type) {
    case 'success':
      return colors.green500;
    case 'warning':
      return colors.yellow500;
    case 'error':
      return colors.red500;
    default:
      return colors.blue500;
  }
}

/** Stacked toast notifications, top-right. */
export function NotificationDisplay() {
  const list = useStore(notifications);
  if (list.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {list.map((n) => (
        <View key={n.id} style={[styles.toast, { backgroundColor: bgFor(n.type) }]}>
          <Icon name={iconFor(n.type)} size={20} color={colors.white} />
          <Text style={styles.message}>{n.message}</Text>
          <Pressable onPress={() => removeNotification(n.id)}>
            <Icon name="times" size={16} color={colors.white} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 50,
    gap: 8,
    width: '100%',
    maxWidth: 320
  },
  toast: {
    padding: 16,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  message: { flex: 1, color: colors.white, fontSize: 14 }
});
