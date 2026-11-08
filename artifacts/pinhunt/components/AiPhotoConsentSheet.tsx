/**
 * "Before we check your photo" (#501): who receives a photo, asked once per
 * user and copy version before anything is sent. In-app, not Alert, so both
 * buttons work on Expo web (memory: expo-web-action-confirmations).
 */
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { AI_PHOTO_CONSENT_COPY as COPY } from '@/utils/aiPhotoConsent';

interface Props {
  visible: boolean;
  onAllow: () => void;
  onDecline: () => void;
}

export function AiPhotoConsentSheet({ visible, onAllow, onDecline }: Props) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View
          accessibilityViewIsModal
          testID="ai-photo-consent"
          style={[styles.card, { backgroundColor: colors.homeSurface, borderColor: colors.homeLine }]}
        >
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.icon, { backgroundColor: colors.homeAqua }]}>
              <Feather name="shield" size={24} color={colors.homeCoralDeep} />
            </View>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.homeInk }]}>{COPY.title}</Text>
            <Text style={[styles.body, { color: colors.homeInk }]}>{COPY.body}</Text>
            <Text style={[styles.body, { color: colors.homeMuted }]}>{COPY.storage}</Text>
            <TouchableOpacity
              onPress={onAllow}
              activeOpacity={0.85}
              accessibilityRole="button"
              style={[styles.primary, { backgroundColor: colors.homeCoral }]}
            >
              <Text style={[styles.primaryLabel, { color: colors.homeSurface }]}>{COPY.allow}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDecline} accessibilityRole="button" style={styles.secondary}>
              <Text style={[styles.secondaryLabel, { color: colors.homeCoralDeep }]}>{COPY.decline}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 380, maxHeight: '90%', borderRadius: 24, borderWidth: 1 },
  content: { padding: 22, alignItems: 'center' },
  icon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center', marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 10, alignSelf: 'stretch' },
  primary: { alignSelf: 'stretch', minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 12 },
  primaryLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  secondary: { alignSelf: 'stretch', minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
