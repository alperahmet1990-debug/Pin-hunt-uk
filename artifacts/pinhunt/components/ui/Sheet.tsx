/**
 * Sheet — the one bottom sheet (UX-041, #120): grabber, title, 44 pt close,
 * a backdrop that is a sibling of the content (never wrapping it, so a tap
 * inside can't also count as a backdrop tap), max 85% of the screen, and
 * keyboard handling: the whole sheet rises with the keyboard, so a text
 * field at the top and the footer button both stay visible.
 *
 * `scroll` (default) wraps the body in a ScrollView; pass `scroll={false}`
 * when the body is itself a list (FlatList) so lists aren't nested.
 */
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Pinned under the body, above the keyboard (e.g. the Save button). */
  footer?: React.ReactNode;
  scroll?: boolean;
  /** iOS: runs once the sheet has fully gone (launch system pickers from here). */
  onDismiss?: () => void;
}

export function Sheet({ visible, onClose, title, children, footer, scroll = true, onDismiss }: SheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.lg);
  const content = (
    <>
      {/* Backdrop and sheet are siblings (memory: expo-native-picker-presentation). */}
      <Pressable
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        testID="sheet-backdrop"
      />
      <View
        accessibilityViewIsModal
        style={[styles.sheet, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.homeLine }]} />
        <View style={styles.header}>
          <Text accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: colors.homeInk }]}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[styles.close, { backgroundColor: colors.homeAqua }]}
          >
            <Feather name="x" size={18} color={colors.homeInk} />
          </TouchableOpacity>
        </View>
        {scroll ? (
          <ScrollView
            style={styles.body}
            contentContainerStyle={[styles.bodyContent, !footer && { paddingBottom: bottomPad }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.body, styles.bodyContent, !footer && { paddingBottom: bottomPad }]}>{children}</View>
        )}
        {footer ? <View style={[styles.footer, { paddingBottom: bottomPad }]}>{footer}</View> : null}
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={onDismiss} statusBarTranslucent>
      {Platform.OS === 'web' ? (
        <View style={styles.root}>{content}</View>
      ) : (
        <KeyboardAvoidingView behavior="padding" style={styles.root}>{content}</KeyboardAvoidingView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.xs },
  title: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  body: { flexShrink: 1 },
  bodyContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
