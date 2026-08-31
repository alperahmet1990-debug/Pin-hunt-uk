import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';

export interface PrimaryActionBarAction {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

interface PrimaryActionBarProps {
  actions: PrimaryActionBarAction[];
}

/** Sticky bottom action bar for a screen's contextual primary actions. */
export function PrimaryActionBar({ actions }: PrimaryActionBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  if (actions.length === 0) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.homeSurface,
          borderTopColor: colors.homeLine,
          paddingBottom: Platform.OS === 'web' ? spacing.md : insets.bottom + spacing.sm,
        },
      ]}
    >
      {actions.map(action => {
        const isPrimary = (action.variant ?? 'primary') === 'primary';
        return (
          <TouchableOpacity
            key={action.key}
            onPress={action.onPress}
            activeOpacity={0.88}
            style={[
              styles.btn,
              isPrimary
                ? { backgroundColor: colors.homeCoral, shadowColor: colors.homeShadow }
                : { backgroundColor: colors.homeAqua, borderWidth: 1, borderColor: colors.homeLine },
              isPrimary && styles.primaryShadow,
            ]}
          >
            {action.icon && (
              <Feather name={action.icon} size={16} color={isPrimary ? colors.homeSurface : colors.homeTeal} />
            )}
            <Text
              numberOfLines={1}
              style={[styles.label, { color: isPrimary ? colors.homeSurface : colors.homeTeal }]}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: radius.lg,
  },
  primaryShadow: {
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  label: { fontSize: 14.5, fontFamily: 'Inter_700Bold' },
});
