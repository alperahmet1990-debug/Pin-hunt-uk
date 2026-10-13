/**
 * ConfirmDialog — in-app confirmation (UX-041, #120). Use this instead of
 * Alert.alert button callbacks, which can silently not run on Expo web
 * (memory: expo-web-action-confirmations). `destructive` paints the confirm
 * button red. The backdrop cancels and is a sibling of the card.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible, title, message, confirmLabel, cancelLabel = 'Cancel', destructive, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const colors = useColors();
  const confirmBg = destructive ? colors.destructive : colors.homeCoral;
  const confirmFg = destructive ? colors.destructiveForeground : colors.homeSurface;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onCancel}
          accessible={false}
          importantForAccessibility="no"
          testID="confirm-backdrop"
        />
        <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.homeSurface }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: colors.homeMuted }]}>{message}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onCancel}
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: colors.homeAqua }]}
            >
              <Text style={[styles.buttonText, { color: colors.homeInk }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              accessibilityRole="button"
              style={[styles.button, { backgroundColor: confirmBg }]}
            >
              <Text style={[styles.buttonText, { color: confirmFg }]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  card: { width: '100%', maxWidth: 360, borderRadius: radius.xxl, padding: spacing.xl, gap: spacing.sm },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  message: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  button: { flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  buttonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
