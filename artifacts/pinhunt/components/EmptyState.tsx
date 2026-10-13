import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface EmptyStateProps {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'inbox',
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.homeAqua, borderRadius: colors.radius * 2 }]}>
        <Feather name={icon} size={32} color={colors.homeMuted} />
      </View>
      <Text style={[styles.title, { color: colors.homeInk }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.homeMuted }]}>{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.homeCoral, borderRadius: colors.radius }]}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={[styles.btnLabel, { color: colors.homeSurface }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
    paddingVertical: 60,
  },
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
});
